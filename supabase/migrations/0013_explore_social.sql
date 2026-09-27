-- =====================================================================
-- 0013_explore_social.sql — the social layer behind Explore
--
-- Explore already existed as a feed of published work with likes. This adds
-- the rest of what a discovery surface needs: categories to browse by,
-- comments, favourites, download counts, and one sortable engagement number.
--
-- A note on where these columns live. The product calls the thing a user
-- makes an "asset"; this schema splits that across two tables — `generations`
-- holds the prompt, the model, the author and the visibility, and `assets`
-- holds the media files a generation produced (an image, a clip, its poster).
-- Everything social attaches to the generation, because that is the unit a
-- person publishes, likes and comments on. `assets` stays what it is: files.
--
-- Safe to re-run: every statement is guarded or CREATE OR REPLACE.
-- =====================================================================

-- Trigram matching for the Explore search box. Without it, `ilike '%foo%'`
-- over prompts is a sequential scan on every keystroke.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- generations — the columns the feed sorts, filters and counts by
-- ---------------------------------------------------------------------
alter table public.generations
  add column if not exists title            text,
  add column if not exists categories       text[] not null default '{}'::text[],
  add column if not exists comment_count    integer not null default 0,
  add column if not exists favourite_count  integer not null default 0,
  add column if not exists download_count   integer not null default 0;

-- A title is optional — most shots are known by their prompt — but when one
-- is set it is what the card leads with, so it gets a sane ceiling.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_title_length'
  ) then
    alter table public.generations
      add constraint generations_title_length
      check (title is null or char_length(title) between 1 and 120);
  end if;
end;
$$;

/*
  Categories are a closed vocabulary, enforced here rather than in the app.

  The alternative — a free-text tag column validated by a Zod schema — is one
  forgotten `parse()` away from a feed full of somebody's arbitrary strings,
  and there is no way to filter or count reliably once that has happened. The
  constraint is the only place that cannot be skipped.

  `lib/categories.ts` mirrors this list and tests/categories.test.ts fails if
  the two drift apart.
*/
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_categories_allowed'
  ) then
    alter table public.generations
      add constraint generations_categories_allowed
      check (
        categories <@ array[
          'portraits', 'anime', 'cinematic', 'product',
          'nature', 'architecture', 'fantasy', 'abstract'
        ]::text[]
        -- Four is what a card can show without the tag row wrapping, and a
        -- shot that claims eight categories is claiming none of them.
        and coalesce(array_length(categories, 1), 0) <= 4
      );
  end if;
end;
$$;

/*
  One number for "Trending".

  PostgREST can only order by a column, not an expression, so a weighted
  ranking has to be stored. A generated column keeps it honest: there is no
  trigger to forget and no backfill job to fall behind, and the arithmetic is
  immutable so Postgres maintains it on every counter write.

  The weights say what the product believes: a comment costs more effort than
  a like, a favourite is a stronger signal than either because it is private
  and has no audience, and a download is the quietest but most real of all.
  Recency is NOT in here — it cannot be, in a stored column — so the feed
  applies a time window instead. See `listPublicGenerations`.
*/
alter table public.generations
  drop column if exists engagement_score;

alter table public.generations
  add column engagement_score integer
  generated always as (
    like_count * 3 + favourite_count * 4 + comment_count * 5 + download_count * 2
  ) stored;

-- Browse by category, newest first. GIN over the array, partial so the index
-- only carries rows the feed can actually return.
create index if not exists generations_explore_categories_idx
  on public.generations using gin (categories)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;

create index if not exists generations_explore_downloads_idx
  on public.generations (download_count desc, created_at desc)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;

create index if not exists generations_explore_trending_idx
  on public.generations (engagement_score desc, created_at desc)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;

-- The search box matches prompts, handles and display names. Trigram indexes
-- are what make the leading-wildcard `ilike` those need survive a real table.
create index if not exists generations_prompt_trgm_idx
  on public.generations using gin (prompt gin_trgm_ops);

create index if not exists generations_author_handle_trgm_idx
  on public.generations using gin (author_handle gin_trgm_ops);

create index if not exists generations_author_name_trgm_idx
  on public.generations using gin (author_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- comments
--
-- Author fields are denormalised for the same reason they are on
-- `generations`: `profiles_select_own` is strictly own-row, and a public
-- comment thread has to render somebody else's name and avatar. Widening the
-- profiles policy to make a join possible would expose every profile column
-- to every visitor; copying three display fields onto the row does not.
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  generation_id     uuid        not null references public.generations (id) on delete cascade,
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  -- One level of replies. A reply to a reply is stored against the same root,
  -- so the thread can never nest deeper than the UI can render.
  parent_id         uuid        references public.comments (id) on delete cascade,

  author_handle     text,
  author_name       text,
  author_avatar_url text,

  body              text        not null check (char_length(btrim(body)) between 1 and 1000),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists comments_generation_created_idx
  on public.comments (generation_id, created_at desc);

create index if not exists comments_parent_idx
  on public.comments (parent_id, created_at asc) where parent_id is not null;

create index if not exists comments_user_idx
  on public.comments (user_id, created_at desc);

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- favourites
--
-- Deliberately a different thing from a like. A like is public applause and
-- moves a counter everyone sees; a favourite is a private bookmark that only
-- its owner can list. They share a shape and nothing else, which is why this
-- is a second table rather than a `kind` column on `likes`.
-- ---------------------------------------------------------------------
create table if not exists public.favourites (
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  generation_id uuid        not null references public.generations (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, generation_id)
);

-- The Favourites page reads newest-first for one user.
create index if not exists favourites_user_created_idx
  on public.favourites (user_id, created_at desc);

create index if not exists favourites_generation_idx
  on public.favourites (generation_id);

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.comments   enable row level security;
alter table public.favourites enable row level security;

/*
  Comments are readable exactly when their generation is.

  This is the mechanism behind "when an asset becomes private, its likes and
  comments stay in the database but stop being publicly accessible" — nothing
  is deleted and nothing has to be cleaned up, because the policy re-evaluates
  against the parent row on every read. Flipping visibility back to public
  brings the thread back intact.
*/
drop policy if exists comments_select_public on public.comments;
create policy comments_select_public on public.comments
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.generations g
      where g.id = comments.generation_id
        and g.visibility = 'public'
        and g.status = 'succeeded'
        and g.deleted_at is null
    )
  );

-- The author can always read their own, even on work that has since been
-- unpublished — otherwise a deleted-comment confirmation has nothing to name.
drop policy if exists comments_select_own on public.comments;
create policy comments_select_own on public.comments
  for select to authenticated
  using (user_id = (select auth.uid()));

/*
  Writes go through `add_comment()` below, not through this policy directly,
  because the counter on `generations` has to move with the row. The policy
  still states the rule the function enforces: you may only write a comment
  as yourself, and only on something that is actually published.
*/
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.generations g
      where g.id = comments.generation_id
        and g.visibility = 'public'
        and g.status = 'succeeded'
        and g.deleted_at is null
    )
  );

/*
  Two people may delete a comment: whoever wrote it, and whoever owns the work
  it is attached to.

  The second is not in the brief, and it is the difference between a comment
  thread and a liability. A creator who publishes to a public feed and cannot
  remove abuse from under their own picture has been handed a problem, not a
  feature. It is scoped as tightly as it can be — the owner may delete a
  comment on their own generation and nothing else.
*/
drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.generations g
      where g.id = comments.generation_id
        and g.user_id = (select auth.uid())
    )
  );

-- No update policy at all. Editing a comment after people have replied to it
-- is a feature with a moderation story attached; deleting and re-posting is
-- the honest version and costs nothing to support.

-- ------------------------------ favourites ----------------------------
-- Own-row only, in all three directions. Nobody can enumerate whose
-- favourites a shot is in — only its total, which lives on the generation.
drop policy if exists favourites_select_own on public.favourites;
create policy favourites_select_own on public.favourites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists favourites_insert_own on public.favourites;
create policy favourites_insert_own on public.favourites
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists favourites_delete_own on public.favourites;
create policy favourites_delete_own on public.favourites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- A note on SQLSTATE, which the earlier migrations got wrong
--
-- Every `raise` below uses P0001 (`raise_exception`). The codes that read as
-- more specific — P0003, P0004, P0005 — are not free for us to assign: P0002
-- is `no_data_found`, P0003 is `too_many_rows`, and P0004 is `assert_failure`.
-- Two things follow from borrowing them, and both are real:
--
--   1. `exception when others` deliberately does not catch `assert_failure`,
--      so a P0004 blows straight through any plpgsql caller's handler. A
--      check script written against these functions cannot test their refusal
--      paths at all — which is how this was found.
--   2. PostgREST maps P0001 to HTTP 400 and an unrecognised code to 500. A
--      user asking to like something that was just unpublished is a 400; as
--      P0004 it was being reported as a server error.
--
-- What distinguishes these failures is the message, which is what
-- explore.service.ts already matches on. `toggle_like` is re-declared at the
-- bottom of this file for the same reason — it shipped in 0006 with the same
-- mistake.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- toggle_favourite — the favourite row and the counter, atomically
--
-- Modelled on `toggle_like` (0006), including the row lock: without it two
-- concurrent writers both read the old count and both write count + 1.
-- ---------------------------------------------------------------------
create or replace function public.toggle_favourite(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_favourited boolean;
  v_ok         boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select (visibility = 'public' and status = 'succeeded' and deleted_at is null)
    into v_ok
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- An owner may favourite their own work; anyone may favourite published
  -- work. What nobody may do is favourite something they cannot see, which is
  -- what this rejects.
  if not v_ok then
    raise exception 'GENERATION_NOT_PUBLIC' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.favourites
    where user_id = v_user and generation_id = p_generation_id
  ) then
    delete from public.favourites
      where user_id = v_user and generation_id = p_generation_id;
    update public.generations
      set favourite_count = greatest(favourite_count - 1, 0)
      where id = p_generation_id;
    v_favourited := false;
  else
    insert into public.favourites (user_id, generation_id)
      values (v_user, p_generation_id);
    update public.generations
      set favourite_count = favourite_count + 1
      where id = p_generation_id;
    v_favourited := true;
  end if;

  return v_favourited;
end;
$$;

-- ---------------------------------------------------------------------
-- add_comment — the row, its denormalised byline, and the counter
--
-- The byline is copied from the caller's own profile inside the function
-- rather than passed in, so a client cannot post under someone else's name.
-- ---------------------------------------------------------------------
create or replace function public.add_comment(
  p_generation_id uuid,
  p_body          text,
  p_parent_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ok     boolean;
  v_body   text := btrim(coalesce(p_body, ''));
  v_root   uuid := p_parent_id;
  v_id     uuid;
  v_handle text;
  v_name   text;
  v_avatar text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'COMMENT_EMPTY' using errcode = 'P0001';
  end if;

  if char_length(v_body) > 1000 then
    raise exception 'COMMENT_TOO_LONG' using errcode = 'P0001';
  end if;

  select (visibility = 'public' and status = 'succeeded' and deleted_at is null)
    into v_ok
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not v_ok then
    raise exception 'GENERATION_NOT_PUBLIC' using errcode = 'P0001';
  end if;

  /*
    Replies are flattened to one level.

    If the parent is itself a reply, this comment is attached to the parent's
    root instead. The thread therefore never nests deeper than the UI draws,
    and no client can produce a chain the renderer has to defend against.

    The parent must also belong to the same generation — otherwise a reply id
    from another shot's thread would graft two conversations together.
  */
  if p_parent_id is not null then
    select coalesce(parent_id, id) into v_root
    from public.comments
    where id = p_parent_id and generation_id = p_generation_id;

    if v_root is null then
      raise exception 'PARENT_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  select handle, display_name, avatar_url
    into v_handle, v_name, v_avatar
  from public.profiles
  where id = v_user;

  insert into public.comments (
    generation_id, user_id, parent_id, author_handle, author_name, author_avatar_url, body
  )
  values (p_generation_id, v_user, v_root, v_handle, v_name, v_avatar, v_body)
  returning id into v_id;

  update public.generations
    set comment_count = comment_count + 1
    where id = p_generation_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- delete_comment — removes a comment, its replies, and the right count
--
-- The cascade on `parent_id` means deleting a root takes its replies with it,
-- so the counter has to come down by the whole subtree rather than by one.
-- ---------------------------------------------------------------------
create or replace function public.delete_comment(p_comment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_generation uuid;
  v_author     uuid;
  v_owner      uuid;
  v_removed    integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select c.generation_id, c.user_id, g.user_id
    into v_generation, v_author, v_owner
  from public.comments c
  join public.generations g on g.id = c.generation_id
  where c.id = p_comment_id;

  if not found then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- The same rule as `comments_delete_own`, restated because this function
  -- runs as definer and RLS is not consulted for it.
  if v_user <> v_author and v_user <> v_owner then
    raise exception 'NOT_PERMITTED' using errcode = 'P0001';
  end if;

  -- Locked before counting, so a reply arriving mid-delete is either included
  -- in the count or rejected by the delete, never one without the other.
  perform 1 from public.generations where id = v_generation for update;

  select count(*)::integer into v_removed
  from public.comments
  where id = p_comment_id or parent_id = p_comment_id;

  delete from public.comments where id = p_comment_id;

  update public.generations
    set comment_count = greatest(comment_count - v_removed, 0)
    where id = v_generation;

  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------
-- register_download — the counter behind "Most downloaded"
--
-- Only published work can be counted, which is also the authorisation check:
-- the app refuses to hand a stranger a private file, and this refuses to
-- pretend one was downloaded.
--
-- An owner downloading their own private shot from the library is a normal
-- thing to do and deliberately does not come through here — their own saves
-- are not a popularity signal.
-- ---------------------------------------------------------------------
create or replace function public.register_download(p_generation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_ok    boolean;
begin
  select (visibility = 'public' and status = 'succeeded' and deleted_at is null)
    into v_ok
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not v_ok then
    raise exception 'GENERATION_NOT_PUBLIC' using errcode = 'P0001';
  end if;

  update public.generations
    set download_count = download_count + 1
    where id = p_generation_id
    returning download_count into v_count;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- creator_stats — what a creator's work has earned, in one round trip
--
-- Summing `like_count` over a creator's rows in the app would mean reading
-- every row they own just to add four numbers. This aggregates in Postgres
-- and returns one row.
--
-- Scoped to the caller: it takes no user id, so there is no version of this
-- that reports on somebody else.
-- ---------------------------------------------------------------------
create or replace function public.creator_stats()
returns table (
  public_count    integer,
  private_count   integer,
  likes_received  integer,
  downloads_received integer,
  favourites_received integer,
  comments_received  integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where visibility = 'public' and status = 'succeeded')::integer,
    count(*) filter (where visibility = 'private')::integer,
    coalesce(sum(like_count), 0)::integer,
    coalesce(sum(download_count), 0)::integer,
    coalesce(sum(favourite_count), 0)::integer,
    coalesce(sum(comment_count), 0)::integer
  from public.generations
  where user_id = auth.uid()
    and deleted_at is null;
$$;

-- ---------------------------------------------------------------------
-- toggle_like — unchanged behaviour, corrected SQLSTATE
--
-- The body is 0006's, which is still right: it checks that the target is
-- published and takes the row lock before touching either the `likes` row or
-- the counter. Only the two error codes change, for the reasons set out above
-- — as P0004 an unpublished target was surfacing to the browser as a 500.
-- ---------------------------------------------------------------------
create or replace function public.toggle_like(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_liked boolean;
  v_ok    boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select (visibility = 'public' and status = 'succeeded' and deleted_at is null)
    into v_ok
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not v_ok then
    raise exception 'GENERATION_NOT_PUBLIC' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.likes where user_id = v_user and generation_id = p_generation_id) then
    delete from public.likes where user_id = v_user and generation_id = p_generation_id;
    update public.generations
      set like_count = greatest(like_count - 1, 0)
      where id = p_generation_id;
    v_liked := false;
  else
    insert into public.likes (user_id, generation_id) values (v_user, p_generation_id);
    update public.generations
      set like_count = like_count + 1
      where id = p_generation_id;
    v_liked := true;
  end if;

  return v_liked;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.toggle_like(uuid)               to authenticated, service_role;
grant execute on function public.toggle_favourite(uuid)          to authenticated, service_role;
grant execute on function public.add_comment(uuid, text, uuid)   to authenticated, service_role;
grant execute on function public.delete_comment(uuid)            to authenticated, service_role;
grant execute on function public.creator_stats()                 to authenticated, service_role;

-- Downloads are counted for signed-out visitors too: the feed is public, the
-- file is public, and a download that does not count because nobody was
-- logged in would make "Most downloaded" a chart of registered users.
grant execute on function public.register_download(uuid)         to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Backfill
--
-- `like_count` predates this migration and is already correct. The three new
-- counters start at zero, which is accurate for downloads and favourites
-- (neither existed) and for comments (same). Nothing to reconcile — this
-- block only repairs `like_count` if an earlier crash left it adrift.
-- ---------------------------------------------------------------------
update public.generations g
set like_count = sub.total
from (
  select generation_id, count(*)::integer as total
  from public.likes
  group by generation_id
) sub
where sub.generation_id = g.id
  and g.like_count <> sub.total;
