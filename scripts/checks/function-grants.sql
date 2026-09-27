-- =====================================================================
-- function-grants.sql — who can execute the privileged functions
--
--   node scripts/db-query.mjs --file scripts/checks/function-grants.sql
--
-- Exists because of a real hole, not a hypothetical one. Four SECURITY
-- DEFINER functions shipped callable by `anon`, and two of them moved
-- money: an anon-key call set one account's balance to 99999. Migration
-- 0021 fixed it; this file is what stops it coming back.
--
-- The trap it guards against: Supabase runs
--
--     alter default privileges in schema public
--       grant execute on functions to anon, authenticated, service_role;
--
-- so a function is born with explicit grants to `anon` and
-- `authenticated`. The obvious lock —
--
--     revoke all on function f(...) from public;
--
-- revokes the PUBLIC pseudo-role's grant, which the function never had. It
-- succeeds and changes nothing. A privileged function has to name `anon`
-- and `authenticated`.
--
-- Read-only: it asserts and prints, and writes nothing.
-- =====================================================================

do $$
declare
  -- Functions that only the service role may execute. Anything that moves
  -- credits, and anything that reads across every account.
  service_only text[] := array[
    'admin_adjust_credits(uuid,integer,text)',
    'set_subscription_credits(uuid,integer,text)',
    'spend_credits(uuid,integer,uuid,text)',
    'refund_credits(uuid,integer,uuid,text)',
    'admin_overview()',
    'admin_daily_series(integer)'
  ];
  -- Functions a signed-in user may call for themselves, but a stranger may not.
  session_only text[] := array[
    'ensure_default_project(uuid)'
  ];
  sig  text;
  role text;
  failures integer := 0;
begin
  foreach sig in array service_only loop
    foreach role in array array['anon', 'authenticated'] loop
      if has_function_privilege(role, ('public.' || sig)::regprocedure, 'EXECUTE') then
        raise warning 'FAIL · % is executable by %', sig, role;
        failures := failures + 1;
      else
        raise notice 'pass · % is closed to %', sig, role;
      end if;
    end loop;

    if not has_function_privilege('service_role', ('public.' || sig)::regprocedure, 'EXECUTE') then
      raise warning 'FAIL · % is not executable by service_role — the app cannot call it', sig;
      failures := failures + 1;
    end if;
  end loop;

  foreach sig in array session_only loop
    if has_function_privilege('anon', ('public.' || sig)::regprocedure, 'EXECUTE') then
      raise warning 'FAIL · % is executable by anon', sig;
      failures := failures + 1;
    else
      raise notice 'pass · % is closed to anon', sig;
    end if;

    if not has_function_privilege('authenticated', ('public.' || sig)::regprocedure, 'EXECUTE') then
      raise warning 'FAIL · % is not executable by authenticated — signed-in users need it', sig;
      failures := failures + 1;
    end if;
  end loop;

  -- The four tables whose grants were revoked outright, rather than being
  -- governed by a policy. A policy that is never reached is still a policy
  -- somebody can add one beside, so these are checked at the grant level.
  foreach sig in array array['app_provider_keys', 'credit_rules', 'audit_log', 'system_logs'] loop
    foreach role in array array['anon', 'authenticated'] loop
      if has_table_privilege(role, ('public.' || sig)::regclass, 'SELECT') then
        raise warning 'FAIL · table % is readable by %', sig, role;
        failures := failures + 1;
      else
        raise notice 'pass · table % is closed to %', sig, role;
      end if;
    end loop;
  end loop;

  if failures > 0 then
    raise exception '% grant check(s) failed', failures;
  end if;

  raise notice 'all grant checks passed';
end;
$$;
