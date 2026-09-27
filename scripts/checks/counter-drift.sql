-- =====================================================================
-- counter-drift.sql — do the denormalised counters still match their rows?
--
--   node scripts/db-query.mjs --file scripts/checks/counter-drift.sql
--
-- `generations.like_count`, `favourite_count` and `comment_count` are
-- denormalised copies of a row count. The application never writes them
-- directly — `toggle_like`, `toggle_favourite`, `add_comment` and
-- `delete_comment` move the row and the counter inside one transaction, with
-- the generation row locked, so through the app they cannot drift.
--
-- What *can* drift them is a hand-written statement: a bulk
-- `delete from favourites where …` during a cleanup bypasses the function and
-- leaves the counter where it was. That is exactly how this file came to
-- exist. Run it after any manual data surgery.
--
-- Read-only. It reports; it does not repair. The repair is at the bottom,
-- commented out, so running the check can never itself change data.
--
-- `download_count` is deliberately absent: downloads have no row to count
-- against, by design. See the note on RATE_LIMITS.downloads in lib/constants.
-- =====================================================================

select
  g.id,
  left(g.prompt, 40)                        as prompt,
  g.visibility,
  g.like_count                              as like_count_stored,
  coalesce(l.total, 0)                      as like_count_actual,
  g.favourite_count                         as favourite_count_stored,
  coalesce(f.total, 0)                      as favourite_count_actual,
  g.comment_count                           as comment_count_stored,
  coalesce(c.total, 0)                      as comment_count_actual
from public.generations g
left join (select generation_id, count(*)::int as total from public.likes      group by generation_id) l on l.generation_id = g.id
left join (select generation_id, count(*)::int as total from public.favourites group by generation_id) f on f.generation_id = g.id
left join (select generation_id, count(*)::int as total from public.comments   group by generation_id) c on c.generation_id = g.id
where g.like_count      <> coalesce(l.total, 0)
   or g.favourite_count <> coalesce(f.total, 0)
   or g.comment_count   <> coalesce(c.total, 0)
order by g.created_at desc;

-- The repair, if the query above returns anything:
--
-- update public.generations g set
--   like_count      = coalesce((select count(*) from public.likes      l where l.generation_id = g.id), 0),
--   favourite_count = coalesce((select count(*) from public.favourites f where f.generation_id = g.id), 0),
--   comment_count   = coalesce((select count(*) from public.comments   c where c.generation_id = g.id), 0)
-- where g.like_count      <> coalesce((select count(*) from public.likes      l where l.generation_id = g.id), 0)
--    or g.favourite_count <> coalesce((select count(*) from public.favourites f where f.generation_id = g.id), 0)
--    or g.comment_count   <> coalesce((select count(*) from public.comments   c where c.generation_id = g.id), 0);
