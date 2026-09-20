-- =====================================================================
-- 0008_subscriptions.sql — plans, subscriptions and payment records
--
-- There is no payment provider behind this. Charges are simulated in the
-- application (src/lib/payments/), and this schema stores the *outcome* the
-- way a real integration would, so swapping a provider in later is a matter
-- of writing to the same tables from a webhook instead of from an action.
--
-- Nothing here stores a card number. `card_brand` and `card_last4` are what a
-- receipt shows and are all that is ever written.
--
-- Safe to re-run: every statement is guarded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- credit_reason gains the subscription movements
--
-- `add value if not exists` is transactional-safe on PG 12+. The rule it
-- imposes is that a value added here cannot be USED as data in the same
-- transaction — which is why nothing below inserts a ledger row, and why the
-- functions only reference the labels inside plpgsql bodies that are parsed
-- when they first run rather than when they are created.
-- ---------------------------------------------------------------------
alter type public.credit_reason add value if not exists 'subscription_grant';

-- ---------------------------------------------------------------------
-- plan_tier / subscription_status
--
-- The statuses are the vocabulary a real provider would send, kept even
-- though nothing sends them today: `past_due` and `trialing` are what a
-- future integration will write, and a schema that cannot represent them
-- would need migrating again on the day it matters.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'pro', 'enterprise');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'active', 'trialing', 'past_due', 'canceled', 'incomplete'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('succeeded', 'failed', 'refunded');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- subscriptions — one row per user
--
-- `user_id` is unique: this product sells one subscription per account, so a
-- second row would be a bug rather than an upgrade path. A user with no row
-- is on the free plan; the row is created the first time they buy something.
--
-- `cancel_at_period_end` is how cancellation works here, and it is the honest
-- model: somebody who has paid for the month keeps the month. `status` only
-- becomes 'canceled' once `current_period_end` has passed.
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references public.profiles (id) on delete cascade,
  plan                 public.plan_tier not null default 'free',
  status               public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_period_end_idx
  on public.subscriptions (current_period_end)
  where cancel_at_period_end;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- payment_transactions — the billing history
--
-- Append-only by convention: a refund is a new row, never an edit to the one
-- being refunded, for the same reason the credit ledger works that way.
--
-- `amount_pence` is an integer. Money is never stored as a float.
-- ---------------------------------------------------------------------
create table if not exists public.payment_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  plan         public.plan_tier not null,
  amount_pence integer not null check (amount_pence >= 0),
  currency     text not null default 'gbp',
  status       public.payment_status not null,
  description  text not null,
  -- What a receipt shows. Never the card number itself.
  card_brand   text,
  card_last4   text,
  reference    text,
  failure_code text,
  created_at   timestamptz not null default now(),

  constraint payment_transactions_last4_len check (card_last4 is null or char_length(card_last4) <= 4)
);

create index if not exists payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
--
-- The owner may READ both tables — it is their plan and their receipts, and
-- the billing page is built from exactly this. There are deliberately no
-- insert, update or delete policies: every write goes through the service
-- role in subscription.service.ts, because a browser that can update its own
-- subscription row can promote itself to Enterprise with one PostgREST call.
-- ---------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.payment_transactions enable row level security;
alter table public.payment_transactions force row level security;

drop policy if exists payment_transactions_select_own on public.payment_transactions;
create policy payment_transactions_select_own on public.payment_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- set_subscription_credits — the plan's allowance, as a floor
--
-- A plan grants "N credits a month", not "N more credits a month": an unused
-- month does not bank. So this SETS the balance rather than adding to it, and
-- the ledger row records the *difference* it made.
--
-- That delta is what keeps the ledger honest. Every other row in
-- `credit_ledger` is a movement, and the invariant the app relies on — that
-- the deltas sum to the balance — only survives if a reset is written as the
-- movement it performed. Setting 100 -> 2500 writes +2400, not +2500.
--
-- It never takes credits away. A downgrade leaves the balance alone: someone
-- who paid for 10,000 credits and moves to Pro keeps what they already bought,
-- and simply stops being topped up to the higher number. Clawing back credits
-- that were paid for would be theft dressed up as a plan change.
--
-- Locks the profile row for the same reason `spend_credits` does: a renewal
-- landing at the same moment as a generation debit must not lose one of them.
-- ---------------------------------------------------------------------
create or replace function public.set_subscription_credits(
  p_user_id uuid,
  p_amount  integer,
  p_note    text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_delta   integer;
begin
  if p_amount < 0 then
    raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode = 'P0001';
  end if;

  select credits into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_delta := p_amount - v_balance;

  -- Already at or above the allowance: nothing to top up, nothing to claw back.
  if v_delta <= 0 then
    return v_balance;
  end if;

  update public.profiles set credits = p_amount where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, note)
  values (p_user_id, v_delta, 'subscription_grant', p_amount, p_note);

  return p_amount;
end;
$$;

revoke all on function public.set_subscription_credits(uuid, integer, text) from anon, authenticated;
