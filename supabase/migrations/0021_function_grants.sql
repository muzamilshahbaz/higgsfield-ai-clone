-- =====================================================================
-- 0021 — lock the privileged functions to the service role
--
-- Found by probing the live database with the public anon key during the
-- admin panel's security testing. Four SECURITY DEFINER functions were
-- callable by `anon`, and two of them moved money:
--
--   · admin_adjust_credits    anyone could mint or claw back credits for
--                             any account, and the ledger row it writes
--                             made the theft look like an operator action
--   · set_subscription_credits  anyone could set any balance outright
--   · admin_overview          leaked user counts, credits held and revenue
--   · admin_daily_series      leaked the same numbers as a daily series
--
-- Proven, not theorised: an anon-key call set one account's balance to
-- 99999 and added a credit to another. Both were reverted.
--
-- ---------------------------------------------------------------------
-- Why the original `revoke` did not work
--
-- 0016 and the billing migration both ended with:
--
--     revoke all on function public.f(...) from public;
--     grant execute on function public.f(...) to service_role;
--
-- which looks airtight and is not. Supabase ships
--
--     alter default privileges in schema public
--       grant execute on functions to anon, authenticated, service_role;
--
-- so every function created in `public` is born with *explicit* grants to
-- `anon` and `authenticated`. `revoke ... from public` removes the PUBLIC
-- pseudo-role's grant — a grant those functions never had — and leaves the
-- two explicit ones untouched. The revoke reported success and changed
-- nothing.
--
-- The rule this file establishes: a privileged function names the roles it
-- is taking the privilege away from. `from public` alone is not a lock.
--
-- ---------------------------------------------------------------------
-- What is deliberately left reachable
--
--   · site_metrics(), creator_stats()      scalars only, and creator_stats
--                                          scopes itself to auth.uid(), so
--                                          an anonymous caller gets zeroes
--   · add_comment, delete_comment,
--     toggle_like, toggle_favourite        each raises NOT_AUTHENTICATED
--                                          for a caller without a uid; the
--                                          anon grant is redundant rather
--                                          than dangerous
--   · register_download                    a signed-out download is meant
--                                          to count, which is why this one
--                                          does not require a session
--   · handle_new_user()                    a trigger function. A direct
--                                          call fails with no `new` record,
--                                          and a trigger does not check
--                                          EXECUTE at fire time — so the
--                                          signup path is not touched here
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The credit functions. These are the two that moved money.
--
-- spend_credits and refund_credits were already correct — they were written
-- with the same `from public` revoke but Supabase's default privileges did
-- not reach them, because they were created before the grant was widened.
-- They are re-stated here anyway so one file answers "who can spend?".
-- ---------------------------------------------------------------------
revoke all on function public.admin_adjust_credits(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_credits(uuid, integer, text)
  to service_role;

revoke all on function public.set_subscription_credits(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.set_subscription_credits(uuid, integer, text)
  to service_role;

revoke all on function public.spend_credits(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, uuid, text)
  to service_role;

revoke all on function public.refund_credits(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, integer, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------
-- The operator read functions.
--
-- Nothing here is destructive, but "credits held across every account" and
-- "revenue in the last thirty days" are numbers a competitor should not be
-- able to read out of a public key, and the daily series is the same figures
-- with a shape.
-- ---------------------------------------------------------------------
revoke all on function public.admin_overview()
  from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;

revoke all on function public.admin_daily_series(integer)
  from public, anon, authenticated;
grant execute on function public.admin_daily_series(integer) to service_role;

-- ---------------------------------------------------------------------
-- ensure_default_project is called on the user's own behalf, so it keeps
-- `authenticated` — but it has no business being reachable without a
-- session, and it was already not granted to anon. Stated for completeness.
-- ---------------------------------------------------------------------
revoke all on function public.ensure_default_project(uuid) from public, anon;
grant execute on function public.ensure_default_project(uuid)
  to authenticated, service_role;
