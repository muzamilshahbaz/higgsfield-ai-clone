-- =====================================================================
-- 0009_billing_country.sql — keep the billing country on the receipt
--
-- The checkout has always asked for a billing country and then thrown it
-- away: it went into the charge request and was never written down. A
-- receipt that cannot say which country it was billed from is missing the
-- one field tax and fraud questions are actually asked about.
--
-- Stores ISO 3166-1 alpha-2 only. The display name and the flag are derived
-- in the application from `src/lib/countries.ts`, so a country being renamed
-- is a package upgrade rather than a data migration.
--
-- Safe to re-run.
-- =====================================================================

alter table public.payment_transactions
  add column if not exists billing_country text;

-- Two letters, uppercase. The check is deliberately shape-only rather than a
-- list of valid codes: ISO 3166-1 gains and loses entries, and a constraint
-- that has to be migrated every time a country changes name is a constraint
-- that gets dropped the first time it is inconvenient. The application
-- validates against the real list on the way in.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_transactions_billing_country_shape'
  ) then
    alter table public.payment_transactions
      add constraint payment_transactions_billing_country_shape
      check (billing_country is null or billing_country ~ '^[A-Z]{2}$');
  end if;
end;
$$;

comment on column public.payment_transactions.billing_country is
  'ISO 3166-1 alpha-2, uppercase. Name and flag are derived in the app.';
