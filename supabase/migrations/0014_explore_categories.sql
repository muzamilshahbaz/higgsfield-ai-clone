-- =====================================================================
-- 0014_explore_categories.sql — three more browse categories
--
-- Fashion, Food and Technology join the vocabulary 0013 established. This is
-- the whole change: a constraint is dropped and re-added with three more
-- strings in its allow-list. No column changes, no data rewritten, no row
-- invalidated — every existing `categories` value is still a subset of the
-- new list, which is what makes an additive change to a `<@` constraint safe.
--
-- Reverting is the same statement with the last three values removed, and is
-- only safe once nothing is tagged with them:
--
--   select count(*) from public.generations
--   where categories && array['fashion','food','technology']::text[];
--
-- `lib/categories.ts` mirrors this list and tests/categories.test.ts fails if
-- the two drift apart, so the compiler and the test suite both notice if only
-- one side of this is updated.
--
-- Safe to re-run.
-- =====================================================================

alter table public.generations
  drop constraint if exists generations_categories_allowed;

alter table public.generations
  add constraint generations_categories_allowed
  check (
    categories <@ array[
      'portraits', 'anime', 'cinematic', 'product',
      'nature', 'architecture', 'fantasy', 'abstract',
      -- Added in 0014.
      'fashion', 'food', 'technology'
    ]::text[]
    -- Four is what a card can show without the tag row wrapping, and a
    -- shot that claims eleven categories is claiming none of them.
    and coalesce(array_length(categories, 1), 0) <= 4
  );
