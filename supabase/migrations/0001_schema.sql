-- =====================================================================
-- 0001_schema.sql — enums, tables, indexes, triggers
-- Kinetic Studio · AI creative studio MVP
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role             as enum ('user', 'admin');
create type public.preset_kind           as enum ('motion', 'style');
create type public.provider_name         as enum ('mock', 'fal', 'replicate');
create type public.generation_task       as enum ('text_to_image', 'text_to_video', 'image_to_video');
create type public.generation_status     as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');
create type public.generation_visibility as enum ('private', 'public');
create type public.asset_kind            as enum ('image', 'video', 'poster');
create type public.credit_reason         as enum (
  'signup_grant', 'generation_debit', 'generation_refund', 'admin_adjust', 'promo'
);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — 1:1 with auth.users, created by the handle_new_user trigger
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  handle       text        not null,
  display_name text,
  avatar_url   text,
  credits      integer     not null default 200 check (credits >= 0),
  role         public.user_role not null default 'user',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index profiles_handle_lower_key on public.profiles (lower(handle));

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- projects — user-owned containers for generations
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  title       text        not null check (char_length(title) between 1 and 80),
  description text,
  cover_url   text,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index projects_user_created_idx on public.projects (user_id, created_at desc);
-- at most one default project per user
create unique index projects_single_default_idx on public.projects (user_id) where is_default;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- presets — the motion/style catalog (seeded from data/presets.json)
-- ---------------------------------------------------------------------
create table public.presets (
  id                 uuid primary key default gen_random_uuid(),
  slug               text        not null unique,
  title              text        not null,
  description        text,
  kind               public.preset_kind not null,
  category           text        not null,
  -- hidden prompt engineering appended to the user's prompt
  prompt_fragment    text        not null,
  negative_prompt    text,
  -- references lib/ai/registry.ts by id, never a raw provider path
  model_id           text        not null,
  params             jsonb       not null default '{}'::jsonb,
  preview_video_url  text,
  preview_poster_url text,
  accent             text,
  credit_cost        integer     not null default 0 check (credit_cost >= 0),
  sort_order         integer     not null default 0,
  is_featured        boolean     not null default false,
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now()
);

create index presets_browse_idx on public.presets (kind, is_active, sort_order);
create index presets_category_idx on public.presets (category) where is_active;

-- ---------------------------------------------------------------------
-- generations — the job record AND the artifact record
-- ---------------------------------------------------------------------
create table public.generations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  project_id        uuid        references public.projects (id) on delete set null,
  preset_id         uuid        references public.presets (id) on delete set null,
  parent_id         uuid        references public.generations (id) on delete set null, -- remix lineage

  -- Author fields are denormalised so the Explore feed needs no join and no
  -- relaxation of the strict own-row-only RLS policy on profiles.
  author_handle     text,
  author_name       text,
  author_avatar_url text,

  task              public.generation_task       not null,
  status            public.generation_status     not null default 'queued',
  progress          real        not null default 0 check (progress between 0 and 1),

  prompt            text        not null default '',
  resolved_prompt   text        not null default '',  -- prompt + preset fragment, stored for reproducibility
  negative_prompt   text,
  input_image_url   text,

  model_id          text        not null,
  provider          public.provider_name not null default 'mock',
  provider_job_id   text,
  params            jsonb       not null default '{}'::jsonb,
  seed              bigint,
  duration_sec      integer,
  aspect_ratio      text        not null default '16:9',

  credit_cost       integer     not null default 0 check (credit_cost >= 0),
  provider_cost_usd numeric(10, 4),

  error_code        text,
  error_message     text,

  visibility        public.generation_visibility not null default 'private',
  like_count        integer     not null default 0,
  remix_count       integer     not null default 0,

  -- a double-clicked Generate button is a no-op, not a double charge
  idempotency_key   text        not null unique,

  queued_at         timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  -- a failed or in-flight job can never be published
  constraint generations_public_requires_success
    check (visibility = 'private' or status = 'succeeded')
);

create index generations_user_created_idx   on public.generations (user_id, created_at desc);
create index generations_project_idx        on public.generations (project_id, created_at desc);
create index generations_explore_new_idx    on public.generations (created_at desc)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;
create index generations_explore_top_idx    on public.generations (like_count desc, created_at desc)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;
create index generations_sweeper_idx        on public.generations (queued_at)
  where status in ('queued', 'running');
create index generations_parent_idx         on public.generations (parent_id) where parent_id is not null;

create trigger generations_touch_updated_at
  before update on public.generations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- assets — output media (a generation may produce several)
-- ---------------------------------------------------------------------
create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  generation_id uuid        not null references public.generations (id) on delete cascade,
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  kind          public.asset_kind not null,
  url           text        not null,
  storage_path  text,
  mime_type     text,
  width         integer,
  height        integer,
  duration_ms   integer,
  size_bytes    bigint,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index assets_generation_idx on public.assets (generation_id, sort_order);
create index assets_user_created_idx on public.assets (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- credit_ledger — append-only money trail
-- ---------------------------------------------------------------------
create table public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  delta         integer     not null,
  reason        public.credit_reason not null,
  generation_id uuid        references public.generations (id) on delete set null,
  balance_after integer     not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- one debit and at most one refund per generation: a retried refund cannot double-credit
create unique index credit_ledger_generation_reason_key
  on public.credit_ledger (generation_id, reason)
  where generation_id is not null;

create index credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------
create table public.likes (
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  generation_id uuid        not null references public.generations (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, generation_id)
);

create index likes_generation_idx on public.likes (generation_id);
