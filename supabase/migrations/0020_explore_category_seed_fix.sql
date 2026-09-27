-- =====================================================================
-- 0020_explore_category_seed_fix.sql
--
-- 0017 seeded eight rows into `content_categories` for the Explore scope and two of
-- them — 'landscape' and 'motion' — are not in the vocabulary a generation may
-- actually be tagged with. The enforcement point is the
-- `generations_categories_allowed` check constraint, mirrored by
-- `CATEGORY_TAGS` in lib/categories.ts, and neither of those two appears in it.
--
-- Nothing was broken by it: rows in this table are labels and ordering, and a label
-- for a tag nothing can carry is inert. But the admin screen now marks such a row
-- "label only", and shipping two of them would make the panel look like it had a bug
-- on first open.
--
-- So the two are removed and the nine missing ones are added, leaving this scope an
-- exact mirror of the constraint.
--
-- Safe to re-run.
-- =====================================================================

delete from public.content_categories
where scope = 'explore' and slug in ('landscape', 'motion');

insert into public.content_categories (scope, slug, label, description, sort_order)
values
  ('explore', 'portraits',    'Portraits',    'People, faces and character work.',          10),
  ('explore', 'anime',        'Anime',        'Illustrated and animation-styled work.',     20),
  ('explore', 'cinematic',    'Cinematic',    'Film-grade lighting and camera language.',   30),
  ('explore', 'fashion',      'Fashion',      'Styling, garments and editorial looks.',     40),
  ('explore', 'nature',       'Nature',       'Landscape, weather, plants and animals.',    50),
  ('explore', 'architecture', 'Architecture', 'Buildings, interiors and structure.',        60),
  ('explore', 'fantasy',      'Fantasy',      'Invented worlds, creatures and mythology.',  70),
  ('explore', 'product',      'Product',      'Objects, packaging and commercial stills.',  80),
  ('explore', 'food',         'Food',         'Dishes, ingredients and drink.',             90),
  ('explore', 'technology',   'Technology',   'Hardware, interfaces and machinery.',       100),
  ('explore', 'abstract',     'Abstract',     'Texture, form and non-representational work.', 110)
on conflict (scope, slug) do nothing;
