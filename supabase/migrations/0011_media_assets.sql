-- =====================================================================
-- 0011_media_assets.sql — reference imagery, in the database
--
-- Every illustrative image in this app used to be a literal in a .tsx file:
-- first six animated SVG gradients under public/samples, then a curated array
-- of CDN ids. Both were the same mistake in different clothes — content that
-- someone has to edit code and redeploy to change.
--
-- This table holds it instead. The marketing page, the preset grid and the
-- empty-state fallbacks all read from here, so adding a photograph is an
-- insert and removing one is a flag.
--
-- What it is NOT is generated output. Nothing in this table was produced by
-- this app, every surface that renders it says so, and `credit_name` exists so
-- the photographer can be named. A row here must never be presented as a
-- user's work or as a model's result.
--
-- Safe to re-run: every statement is guarded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- media_category — what is in the frame
--
-- Surfaces ask for a category rather than a specific picture, so the feel of
-- a section can change by reseeding rather than by editing a component.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_category') then
    create type public.media_category as enum (
      'landscape',
      'person',
      'animal',
      'urban',
      'abstract',
      'still_life'
    );
  end if;
end;
$$;

create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  category     public.media_category not null,
  -- Absolute, and served by whoever hosts it. Storing a URL rather than bytes
  -- keeps this table a catalogue: the images are someone else's to host and
  -- ours only to point at.
  url          text not null,
  -- What is actually in the photograph, for alt text. Not a caption and not a
  -- claim about how it was made.
  alt          text not null,
  width        integer,
  height       integer,
  -- Attribution. The Unsplash licence does not require it; naming a
  -- photographer is the decent default anyway.
  credit_name  text,
  credit_url   text,
  -- Free-form, for a surface that wants "something moody" rather than a
  -- category: {'cinematic','fog','wide'}.
  tags         text[] not null default '{}',
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint media_assets_url_absolute check (url ~ '^https://'),
  constraint media_assets_alt_len check (char_length(alt) between 1 and 300)
);

create index if not exists media_assets_category_idx
  on public.media_assets (category, sort_order)
  where is_active;

create index if not exists media_assets_tags_idx
  on public.media_assets using gin (tags);

drop trigger if exists media_assets_touch_updated_at on public.media_assets;
create trigger media_assets_touch_updated_at
  before update on public.media_assets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS: world-readable, nobody writes.
--
-- This is catalogue content on a public landing page — an anonymous visitor
-- has to be able to read it before they have a session. No insert, update or
-- delete policy exists for anon or authenticated, so the only way in is the
-- service role, which is what the seed script uses.
-- ---------------------------------------------------------------------
alter table public.media_assets enable row level security;

drop policy if exists media_assets_select_active on public.media_assets;
create policy media_assets_select_active
  on public.media_assets
  for select
  using (is_active);
