-- =====================================================================
-- 0019_configurable_signup_grant.sql
--
-- The signup grant was a literal in `handle_new_user()`: `v_credits integer :=
-- 200`. The admin panel is supposed to be able to change what a new account is
-- given, and a value only a migration can change is not configurable.
--
-- This is the one place in this sprint where a rewrite touches a path that moves
-- money, so it is deliberately the smallest possible change:
--
--   · The function is otherwise byte-for-byte what 0002 defined. Handle
--     derivation, the display-name fallback, the profile insert, the ledger row
--     and the default project are untouched.
--   · The lookup is wrapped so that a missing row, a disabled rule, a null, or a
--     table that does not exist yet all resolve to 200 — the value the function
--     used before. A broken config cannot stop an account being created, and
--     cannot silently grant zero.
--   · `greatest(…, 0)` holds the `profiles.credits >= 0` check, so a negative
--     amount typed into the admin form cannot make signup fail for everybody.
--
-- The ledger row still records exactly what was granted, so the money trail
-- stays consistent whatever the configured amount is.
--
-- Safe to re-run.
-- =====================================================================

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
  v_credits  integer;
  v_project  uuid;
begin
  -- The configured grant, or the value this function shipped with.
  --
  -- `exception when others` rather than a narrower handler on purpose: every way
  -- this lookup can fail — no table, no row, a permissions change, a type that
  -- has been altered underneath it — has the same correct answer, which is "use
  -- the default and let the account be created".
  begin
    select amount into v_credits
    from public.credit_rules
    where key = 'signup_grant' and enabled
    limit 1;
  exception when others then
    v_credits := null;
  end;

  v_credits := greatest(coalesce(v_credits, 200), 0);

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

  -- A grant of zero is a legitimate configuration — an operator closing the free
  -- tier — and a ledger row with `delta = 0` would be noise in the money trail.
  if v_credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, balance_after, note)
    values (new.id, v_credits, 'signup_grant', v_credits, 'Welcome grant');
  end if;

  insert into public.projects (user_id, title, description, is_default)
  values (new.id, 'My First Project', 'Everything you create lands here by default.', true)
  returning id into v_project;

  return new;
end;
$$;
