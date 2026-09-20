-- =====================================================================
-- 0007_provider_keys.sql — bring-your-own-key vault
--
-- Users connect their own provider accounts. The secret itself is sealed
-- with AES-256-GCM in the application before it ever reaches Postgres, so
-- a database dump leaks ciphertext and nothing else.
--
-- Safe to re-run: every statement is guarded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- provider_name — one value per connectable vendor
--
-- `add value if not exists` is transactional-safe on PG 12+, which is what
-- Supabase runs. The one rule it does impose: a value added here cannot be
-- USED as data in the same transaction, which is why nothing below writes a
-- row and why no column default names one of the new labels.
-- ---------------------------------------------------------------------
alter type public.provider_name add value if not exists 'flux';
alter type public.provider_name add value if not exists 'stability';
alter type public.provider_name add value if not exists 'openai';
alter type public.provider_name add value if not exists 'google';
alter type public.provider_name add value if not exists 'kling';
alter type public.provider_name add value if not exists 'runway';
alter type public.provider_name add value if not exists 'luma';
alter type public.provider_name add value if not exists 'pika';

-- ---------------------------------------------------------------------
-- provider_key_status — result of the last verification attempt
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'provider_key_status') then
    create type public.provider_key_status as enum ('unverified', 'valid', 'invalid', 'unreachable');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- user_provider_keys
--
-- `ciphertext` is base64(iv || auth tag || sealed bytes). `key_prefix` and
-- `last4` exist so the UI can render `sk-••••••••1234` without the server
-- ever decrypting anything for a display path.
--
-- One row per (user, provider): reconnecting replaces, it does not append.
-- ---------------------------------------------------------------------
create table if not exists public.user_provider_keys (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  provider         public.provider_name not null,
  label            text,
  ciphertext       text not null,
  key_prefix       text not null default '',
  last4            text not null default '',
  status           public.provider_key_status not null default 'unverified',
  last_verified_at timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint user_provider_keys_last4_len check (char_length(last4) <= 8),
  constraint user_provider_keys_prefix_len check (char_length(key_prefix) <= 12),
  constraint user_provider_keys_label_len check (label is null or char_length(label) <= 48)
);

create unique index if not exists user_provider_keys_user_provider_key
  on public.user_provider_keys (user_id, provider);

create index if not exists user_provider_keys_user_idx
  on public.user_provider_keys (user_id, created_at desc);

drop trigger if exists user_provider_keys_touch_updated_at on public.user_provider_keys;
create trigger user_provider_keys_touch_updated_at
  before update on public.user_provider_keys
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS: enabled with NO policies, on purpose.
--
-- Every other table in this schema grants the owner a select policy. This one
-- deliberately does not. A policy that lets `authenticated` read its own row
-- would put `ciphertext` one PostgREST call away from any browser holding a
-- valid JWT — and the whole point of sealing the key is that the browser
-- never sees it, in plaintext or sealed.
--
-- RLS with zero policies denies everything to anon and authenticated. The
-- service role bypasses RLS, so services/ai-keys.service.ts is the only way
-- in, and it filters on user_id explicitly because no policy will do it here.
-- The grants below are revoked as well: RLS alone is the guarantee, but a
-- table nobody is granted on cannot be reached even if a future migration
-- adds a careless policy.
-- ---------------------------------------------------------------------
alter table public.user_provider_keys enable row level security;
alter table public.user_provider_keys force row level security;

revoke all on public.user_provider_keys from anon, authenticated;
