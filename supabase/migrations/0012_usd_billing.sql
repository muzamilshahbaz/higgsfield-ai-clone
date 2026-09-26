-- =====================================================================
-- 0012_usd_billing.sql — the catalogue is priced in USD
--
-- The plan catalogue moved from pounds to dollars. Every insert in
-- services/subscription.service.ts already passes `currency` explicitly, so
-- nothing in the running app depends on this migration — it is here to stop
-- the column's default from quietly writing 'gbp' onto a row that some future
-- insert forgets to set.
--
-- Existing rows are deliberately left alone. A receipt written before the move
-- records a charge that really was in pounds, and the billing history formats
-- each row with its own `currency`, so old receipts keep reading £ and new
-- ones read $. Rewriting them to 'usd' would restate an amount nobody was
-- charged, which is the one thing a payment record must never do.
--
-- `amount_pence` keeps its name. It holds minor units — 2400 is £24 on an old
-- row and $24 on a new one — and renaming a column that six months of rows
-- already live in buys a better word at the cost of a breaking change.
-- ---------------------------------------------------------------------

alter table public.payment_transactions
  alter column currency set default 'usd';

comment on column public.payment_transactions.currency is
  'ISO 4217, lower case. Per row: pre-2026-09 rows are gbp, later rows usd.';

comment on column public.payment_transactions.amount_pence is
  'Minor units of the row''s own currency. Integer — money is never a float.';
