-- =====================================================================
-- 0015_cms_enums.sql — enum values only, nothing else
--
-- This file exists on its own for one Postgres rule: a value added to an
-- EXISTING enum with `alter type ... add value` cannot be USED as data in the
-- same transaction. scripts/apply-migration.mjs wraps a file in a transaction,
-- so a migration that both adds `'editor'` and writes a row naming it fails
-- with an unhelpful error halfway through.
--
-- So the additions land here, alone, and 0016_cms.sql — a separate transaction
-- — is free to reference them. Nothing below writes a row, sets a column
-- default, or names one of these values in a policy expression.
--
-- Safe to re-run: `add value if not exists` is idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- user_role — the staff ladder
--
-- 'user' and 'admin' already exist. The three below split what was one
-- undifferentiated admin bit into roles with different reach, because "can
-- edit the FAQ" and "can rotate the fal.ai key" should not be the same grant.
--
-- The permission matrix itself lives in src/lib/admin/permissions.ts, not in
-- the database: it is a product decision that changes more often than a schema
-- and is far easier to read — and to unit test — as a table of capabilities
-- than as a pile of policy expressions.
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'editor';
alter type public.user_role add value if not exists 'moderator';
alter type public.user_role add value if not exists 'super_admin';

-- ---------------------------------------------------------------------
-- media_category — three buckets the media manager needs that a photograph
-- catalogue did not.
--
-- `media_assets` was seeded with reference photography, where every row is
-- something that was in front of a camera. Once an operator can upload, the
-- table also holds a logo, a favicon and an OG image — none of which is a
-- landscape or a still life, and all of which would otherwise be filed under
-- whichever category was least wrong.
-- ---------------------------------------------------------------------
alter type public.media_category add value if not exists 'brand';
alter type public.media_category add value if not exists 'ui';
alter type public.media_category add value if not exists 'other';
