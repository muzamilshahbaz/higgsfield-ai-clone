-- =====================================================================
-- 0002_functions.sql — signup bootstrap, credit ledger, likes
-- Every money-moving operation lives here, not in application code.
-- =====================================================================

-- ---------------------------------------------------------------------
-- handle_new_user — profile + signup grant + default project, atomically
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     text;
  v_handle   text;
  v_name     text;
  v_credits  integer := 200;
  v_project  uuid;
begin
  v_base := regexp_replace(
    lower(split_part(coalesce(new.email, 'creator'), '@', 1)),
    '[^a-z0-9_]', '', 'g'
  );
  if v_base is null or v_base = '' then
    v_base := 'creator';
  end if;

  v_handle := v_base;
  while exists (select 1 from public.profiles p where lower(p.handle) = lower(v_handle)) loop
    v_handle := v_base || substr(md5(random()::text), 1, 4);
  end loop;

  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    initcap(v_base)
  );

  insert into public.profiles (id, email, handle, display_name, avatar_url, credits)
  values (
    new.id,
    new.email,
    v_handle,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    v_credits
  );

  insert into public.credit_ledger (user_id, delta, reason, balance_after, note)
  values (new.id, v_credits, 'signup_grant', v_credits, 'Welcome grant');

  insert into public.projects (user_id, title, description, is_default)
  values (new.id, 'My First Project', 'Everything you create lands here by default.', true)
  returning id into v_project;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- spend_credits — the ONLY way credits leave a balance
-- Locks the profile row, writes the ledger, returns the new balance.
-- Raises INSUFFICIENT_CREDITS (SQLSTATE P0001) when the balance is short.
-- ---------------------------------------------------------------------
create or replace function public.spend_credits(
  p_user_id       uuid,
  p_amount        integer,
  p_generation_id uuid default null,
  p_note          text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
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

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  v_balance := v_balance - p_amount;

  update public.profiles set credits = v_balance where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, generation_id, balance_after, note)
  values (p_user_id, -p_amount, 'generation_debit', p_generation_id, v_balance, p_note);

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- refund_credits — idempotent by construction
-- A second call for the same generation is a no-op that returns the
-- current balance, so retries and the sweeper can never double-credit.
-- ---------------------------------------------------------------------
create or replace function public.refund_credits(
  p_user_id       uuid,
  p_amount        integer,
  p_generation_id uuid,
  p_note          text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  select credits into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- guarded by the profile row lock we already hold
  if exists (
    select 1 from public.credit_ledger
    where generation_id = p_generation_id
      and reason = 'generation_refund'
  ) then
    return v_balance;
  end if;

  v_balance := v_balance + greatest(p_amount, 0);

  update public.profiles set credits = v_balance where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, generation_id, balance_after, note)
  values (p_user_id, greatest(p_amount, 0), 'generation_refund', p_generation_id, v_balance,
          coalesce(p_note, 'Automatic refund for a failed generation'));

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- toggle_like — like/unlike plus the denormalised counter, atomically
-- ---------------------------------------------------------------------
create or replace function public.toggle_like(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_liked boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0003';
  end if;

  if exists (select 1 from public.likes where user_id = v_user and generation_id = p_generation_id) then
    delete from public.likes where user_id = v_user and generation_id = p_generation_id;
    update public.generations
      set like_count = greatest(like_count - 1, 0)
      where id = p_generation_id;
    v_liked := false;
  else
    insert into public.likes (user_id, generation_id) values (v_user, p_generation_id);
    update public.generations
      set like_count = like_count + 1
      where id = p_generation_id;
    v_liked := true;
  end if;

  return v_liked;
end;
$$;

-- ---------------------------------------------------------------------
-- ensure_default_project — the composer never blocks on project setup
-- ---------------------------------------------------------------------
create or replace function public.ensure_default_project(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.projects
  where user_id = p_user_id and deleted_at is null
  order by is_default desc, created_at asc
  limit 1;

  if v_id is null then
    insert into public.projects (user_id, title, is_default)
    values (p_user_id, 'My First Project', true)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Grants: signed-in users may like; only the service role may move credits.
revoke execute on function public.spend_credits(uuid, integer, uuid, text)  from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.ensure_default_project(uuid)              from public, anon;

grant execute on function public.toggle_like(uuid)                          to authenticated, service_role;
grant execute on function public.spend_credits(uuid, integer, uuid, text)   to service_role;
grant execute on function public.refund_credits(uuid, integer, uuid, text)  to service_role;
grant execute on function public.ensure_default_project(uuid)               to authenticated, service_role;
