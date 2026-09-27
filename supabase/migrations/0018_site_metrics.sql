-- =====================================================================
-- 0018_site_metrics.sql — the counts the landing page is allowed to print
--
-- The statistics band can now count real things — creators, projects, assets,
-- published shots — and an anonymous visitor has to be able to read those
-- numbers before they have a session.
--
-- It cannot read them from the tables. `profiles` is own-row by policy and
-- `projects` is owner-scoped, which is correct and is not being relaxed: a
-- landing page that needed SELECT on `profiles` to print a headcount would have
-- traded the strongest policy in the schema for a number.
--
-- So the count comes from one SECURITY DEFINER function that returns exactly
-- those aggregates and nothing else. It takes no arguments, so there is no form
-- of the call that reports on a particular person, and it returns scalars, so
-- there is nothing in the result to walk back to a row.
--
-- Safe to re-run.
-- =====================================================================

create or replace function public.site_metrics()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    -- Accounts that have published at least one shot. Deliberately not "total
    -- signups": a creator count that includes everyone who signed up and left is
    -- the kind of number this page has spent two rewrites refusing to print.
    'creators', (
      select count(distinct user_id) from public.generations
      where visibility = 'public' and status = 'succeeded' and deleted_at is null
    ),
    'projects', (select count(*) from public.projects where deleted_at is null),
    'assets', (select count(*) from public.assets),
    'public_generations', (
      select count(*) from public.generations
      where visibility = 'public' and status = 'succeeded' and deleted_at is null
    ),
    'presets', (select count(*) from public.presets where is_active),
    -- Distinct billing countries seen on a settled transaction. Reads as a
    -- reach figure and is honest about being one; the Stats component drops a
    -- cell whose count is zero, so on a deployment with no transactions this
    -- stat simply does not appear.
    'countries', (
      select count(distinct billing_country) from public.payment_transactions
      where status = 'succeeded' and billing_country is not null
    )
  );
$$;

-- Anonymous visitors are the primary caller: this is a landing-page read.
grant execute on function public.site_metrics() to anon, authenticated, service_role;
