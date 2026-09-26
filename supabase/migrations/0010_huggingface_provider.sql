-- =====================================================================
-- 0010_huggingface_provider.sql — Hugging Face Inference Providers
--
-- Adds the one vendor name the enum was missing. Hugging Face is the first
-- provider the router tries (services/ai/ai-router.ts), because one token
-- serves FLUX.1, SDXL and the rest of the open-weight image catalogue.
--
-- Safe to re-run: `add value if not exists` is a no-op the second time.
--
-- The rule this migration has to respect, same as 0007: a value added to an
-- enum cannot be USED as data in the same transaction. So nothing below
-- writes a row and no column default names the new label.
-- =====================================================================

alter type public.provider_name add value if not exists 'huggingface';
