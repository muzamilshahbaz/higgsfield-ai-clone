-- =====================================================================
-- 0016_cms.sql — the content management schema
--
-- Everything the landing page says, every price it quotes, every provider it
-- lists and every switch that turns a feature off moves out of .ts literals
-- and into these tables. The rule the whole file follows: a surface reads the
-- database and falls back to a code-level default when the database has
-- nothing to say, so a fresh clone and an unreachable Postgres both still
-- render a complete page.
--
-- Two things deliberately stay in code, and the report says so:
--
--   · lib/ai/registry.ts still owns model routing and credit prices. `ai_models`
--     below is a presentation overlay keyed by registry id — it decides what a
--     visitor is shown about a model, never what a generation costs or which
--     vendor runs it. Letting an editor reprice a render from a CMS form is a
--     way to lose money, not a feature.
--   · Infrastructure secrets stay environment variables. `app_provider_keys`
--     holds vendor API keys (sealed, and only those), because those are
--     operational configuration. A service-role key or a JWT secret is not.
--
-- Writes: every table here is written by the service-role client behind an
-- authorization check in src/lib/admin/guard.ts, exactly like the credit and
-- provider paths already in this schema. The RLS at the bottom therefore grants
-- SELECT to the surfaces that need it and nothing else — there is no policy
-- anywhere in this file that lets a browser write CMS content.
--
-- Safe to re-run: every statement is guarded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums created fresh here.
--
-- Unlike the additions in 0015, a type created inside this transaction may also
-- be used in it — so these can carry column defaults.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'suspended', 'banned');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_moderation_status') then
    create type public.content_moderation_status as enum ('approved', 'pending', 'hidden');
  end if;

  if not exists (select 1 from pg_type where typname = 'log_level') then
    create type public.log_level as enum ('debug', 'info', 'warn', 'error');
  end if;
end;
$$;

-- =====================================================================
-- SETTINGS AND FLAGS
-- =====================================================================

-- ---------------------------------------------------------------------
-- app_settings — one row per configurable value, jsonb payload
--
-- Key/value rather than a wide singleton row, for two reasons. A new setting is
-- an insert instead of a migration; and `is_public` can be decided per key,
-- which a column on a single row cannot express. That flag is load bearing: it
-- is the entire read policy at the bottom of this file, so a setting reaches a
-- browser only when somebody marked it so.
--
-- `value` is jsonb and always a JSON scalar, object or array — never a bare
-- Postgres string — so a boolean setting round-trips as a boolean rather than
-- as the text 'true'.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb       not null,
  -- Groups the admin UI renders as sections: site, seo, social, branding,
  -- theme, generation, credits, storage, limits, legal.
  category    text        not null default 'general',
  label       text        not null default '',
  description text,
  -- True when an anonymous visitor's page render needs it. Never true for
  -- anything an operator would mind a stranger reading.
  is_public   boolean     not null default false,
  -- True when the value is a credential. Nothing in this schema uses it yet —
  -- vendor keys live in `app_provider_keys`, sealed — but a settings row that
  -- ever holds one must be kept out of a client payload, and this is the flag
  -- services/admin/settings.service.ts checks before serialising.
  is_secret   boolean     not null default false,
  sort_order  integer     not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,

  constraint app_settings_key_shape check (key ~ '^[a-z][a-z0-9_.]{1,62}$')
);

create index if not exists app_settings_category_idx
  on public.app_settings (category, sort_order);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- feature_flags — the kill switches
--
-- Read by src/lib/flags.ts, which caches them per request and resolves an
-- unknown or unreadable key to its code-level default rather than to `false`.
-- That direction matters: a flag table that fails to load must not silently
-- switch Explore off for everybody.
-- ---------------------------------------------------------------------
create table if not exists public.feature_flags (
  key         text primary key,
  label       text        not null,
  description text,
  enabled     boolean     not null default true,
  category    text        not null default 'features',
  sort_order  integer     not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,

  constraint feature_flags_key_shape check (key ~ '^[a-z][a-z0-9_]{1,40}$')
);

drop trigger if exists feature_flags_touch_updated_at on public.feature_flags;
create trigger feature_flags_touch_updated_at
  before update on public.feature_flags
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- LANDING PAGE
-- =====================================================================

-- ---------------------------------------------------------------------
-- landing_sections — the band registry
--
-- `key` names a component in src/components/marketing/, and the page maps over
-- the rows in `sort_order` to decide what renders and in what order. A key the
-- page does not recognise is skipped rather than thrown, so a row added by hand
-- cannot take the homepage down.
--
-- The copy columns are the ones every band shares. Anything band-specific goes
-- in `config`, which each component narrows for itself — the alternative being
-- twenty nullable columns that one section each would use.
-- ---------------------------------------------------------------------
create table if not exists public.landing_sections (
  key         text primary key,
  label       text        not null,
  -- The two-digit number the eyebrow prints. Stored rather than counted: the
  -- copy elsewhere on the page refers to these numbers, so a section that moves
  -- should keep the one it was given.
  index_label text,
  eyebrow     text,
  title       text,
  lead        text,
  body        text,
  cta_label   text,
  cta_href    text,
  media_id    uuid references public.media_assets (id) on delete set null,
  config      jsonb       not null default '{}'::jsonb,
  is_visible  boolean     not null default true,
  sort_order  integer     not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,

  constraint landing_sections_key_shape check (key ~ '^[a-z][a-z0-9_]{1,40}$')
);

create index if not exists landing_sections_order_idx
  on public.landing_sections (sort_order) where is_visible;

drop trigger if exists landing_sections_touch_updated_at on public.landing_sections;
create trigger landing_sections_touch_updated_at
  before update on public.landing_sections
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- site_features — the cards in the bento grid and the overview column
--
-- One table for both, because they are the same shape and an editor moving a
-- card between bands should be changing `placement` rather than re-typing it
-- into a second form. `icon` is a lucide-react export name, resolved through an
-- allow-list in src/lib/admin/icons.ts — a component that renders
-- `icons[row.icon]` straight from a text column is an import by name from
-- editable input.
-- ---------------------------------------------------------------------
create table if not exists public.site_features (
  id          uuid primary key default gen_random_uuid(),
  placement   text        not null default 'features',
  title       text        not null,
  body        text        not null default '',
  detail      text,
  icon        text,
  -- A Tailwind column-span class for the asymmetric grid, validated against an
  -- allow-list in the admin form. The grid is uneven by design and the
  -- exceptions read better as classes than as a layout algorithm.
  span        text,
  href        text,
  media_id    uuid references public.media_assets (id) on delete set null,
  sort_order  integer     not null default 0,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint site_features_title_len check (char_length(title) between 1 and 120),
  constraint site_features_placement_allowed
    check (placement in ('features', 'overview', 'capabilities', 'footer_note'))
);

create index if not exists site_features_placement_idx
  on public.site_features (placement, sort_order) where is_visible;

drop trigger if exists site_features_touch_updated_at on public.site_features;
create trigger site_features_touch_updated_at
  before update on public.site_features
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- site_stats — the numbers band
--
-- `value_kind` is the interesting column. 'literal' prints `literal_value`;
-- every other value is counted at render time from the catalogue or the
-- database, so "Open models" cannot go stale and "Creators" is the real
-- number. An operator chooses which of the two a row is — which is the honest
-- version of an editable statistic: you may set a number by hand, and the page
-- then says so by not counting anything.
-- ---------------------------------------------------------------------
create table if not exists public.site_stats (
  id            uuid primary key default gen_random_uuid(),
  key           text        not null unique,
  label         text        not null,
  detail        text,
  value_kind    text        not null default 'literal',
  literal_value text,
  prefix        text,
  suffix        text,
  sort_order    integer     not null default 0,
  is_visible    boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint site_stats_value_kind_allowed check (
    value_kind in (
      'literal', 'models', 'presets', 'providers', 'signup_credits',
      'creators', 'projects', 'assets', 'countries', 'public_generations'
    )
  ),
  -- A literal row with nothing to print is a blank cell on the homepage.
  constraint site_stats_literal_present
    check (value_kind <> 'literal' or coalesce(literal_value, '') <> '')
);

create index if not exists site_stats_order_idx
  on public.site_stats (sort_order) where is_visible;

drop trigger if exists site_stats_touch_updated_at on public.site_stats;
create trigger site_stats_touch_updated_at
  before update on public.site_stats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- faq_entries
-- ---------------------------------------------------------------------
create table if not exists public.faq_entries (
  id         uuid primary key default gen_random_uuid(),
  question   text        not null,
  answer     text        not null,
  category   text        not null default 'general',
  sort_order integer     not null default 0,
  is_visible boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint faq_entries_question_len check (char_length(question) between 3 and 300),
  constraint faq_entries_answer_len check (char_length(answer) between 3 and 4000)
);

create index if not exists faq_entries_order_idx
  on public.faq_entries (sort_order) where is_visible;

drop trigger if exists faq_entries_touch_updated_at on public.faq_entries;
create trigger faq_entries_touch_updated_at
  before update on public.faq_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- testimonials
--
-- Seeded empty, on purpose. The landing page's own rule — no invented social
-- proof — outlives this migration: the section renders only when there is at
-- least one visible row, so making the table manageable does not put fabricated
-- quotes on the homepage. `is_verified` records that a real person said it.
-- ---------------------------------------------------------------------
create table if not exists public.testimonials (
  id              uuid primary key default gen_random_uuid(),
  author_name     text        not null,
  author_role     text,
  author_company  text,
  author_url      text,
  avatar_media_id uuid references public.media_assets (id) on delete set null,
  avatar_url      text,
  quote           text        not null,
  rating          integer     check (rating is null or rating between 1 and 5),
  is_verified     boolean     not null default false,
  is_featured     boolean     not null default false,
  sort_order      integer     not null default 0,
  is_visible      boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint testimonials_quote_len check (char_length(quote) between 3 and 1200),
  constraint testimonials_author_len check (char_length(author_name) between 1 and 120)
);

create index if not exists testimonials_order_idx
  on public.testimonials (sort_order) where is_visible;

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- announcements — the banner
--
-- A window rather than a boolean: `starts_at`/`ends_at` mean a maintenance
-- notice can be scheduled and expires on its own instead of living until
-- somebody remembers it. `is_active` is the manual override on top.
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text        not null,
  body           text,
  variant        text        not null default 'info',
  href           text,
  cta_label      text,
  placement      text        not null default 'global',
  is_dismissible boolean     not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      boolean     not null default true,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,

  constraint announcements_title_len check (char_length(title) between 2 and 200),
  constraint announcements_variant_allowed
    check (variant in ('info', 'success', 'warning', 'danger', 'brand')),
  constraint announcements_placement_allowed
    check (placement in ('global', 'marketing', 'studio', 'admin')),
  -- A window that closes before it opens shows nothing, ever. Better rejected
  -- at the door than left for someone to wonder why their banner never ran.
  constraint announcements_window_ordered
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists announcements_live_idx
  on public.announcements (placement, sort_order) where is_active;

drop trigger if exists announcements_touch_updated_at on public.announcements;
create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- workflow_steps — the "how it works" rail
-- ---------------------------------------------------------------------
create table if not exists public.workflow_steps (
  id         uuid primary key default gen_random_uuid(),
  title      text        not null,
  body       text        not null default '',
  -- The mono line under each step, naming what you get back at that stage.
  artefact   text,
  sort_order integer     not null default 0,
  is_visible boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workflow_steps_title_len check (char_length(title) between 1 and 120)
);

create index if not exists workflow_steps_order_idx
  on public.workflow_steps (sort_order) where is_visible;

drop trigger if exists workflow_steps_touch_updated_at on public.workflow_steps;
create trigger workflow_steps_touch_updated_at
  before update on public.workflow_steps
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- nav_links — header, footer columns and social links
--
-- `nav_group` is text with a check rather than an enum because a footer column
-- is editorial: adding one should be a one-line constraint change, not a
-- migration that rewrites a type.
--
-- `is_route` distinguishes a real path from an in-page anchor, which is what
-- `resolveMarketingHref` needs in order to rewrite `#pricing` as `/#pricing`
-- when the bar renders off the landing page.
-- ---------------------------------------------------------------------
create table if not exists public.nav_links (
  id          uuid primary key default gen_random_uuid(),
  nav_group   text        not null,
  label       text        not null,
  href        text        not null default '',
  icon        text,
  is_route    boolean     not null default true,
  is_external boolean     not null default false,
  sort_order  integer     not null default 0,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint nav_links_label_len check (char_length(label) between 1 and 60),
  constraint nav_links_group_allowed check (
    nav_group in (
      'header', 'footer_product', 'footer_workspace',
      'footer_account', 'footer_note', 'social', 'legal'
    )
  )
);

create index if not exists nav_links_group_idx
  on public.nav_links (nav_group, sort_order) where is_visible;

drop trigger if exists nav_links_touch_updated_at on public.nav_links;
create trigger nav_links_touch_updated_at
  before update on public.nav_links
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- COMMERCE
-- =====================================================================

-- ---------------------------------------------------------------------
-- plans — the price list
--
-- `id` is the text tier key ('free', 'pro', 'enterprise'), which is also the
-- `plan_tier` enum value stored on `subscriptions.plan`. Keeping them the same
-- string is what lets an operator edit a plan's price and perks here without
-- touching the enum the entitlement path enforces against.
--
-- What an operator may NOT do from here is invent a fourth tier: `plan_tier` is
-- a Postgres enum and a subscription row cannot name a value it has no label
-- for. The admin form therefore edits the three that exist rather than
-- offering a Create button that would fail at checkout — see
-- src/services/admin/plans.service.ts.
--
-- `price_usd` is numeric(10,2), not a float. Money is never a float.
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id                        text primary key,
  name                      text        not null,
  tagline                   text        not null default '',
  price_usd                 numeric(10, 2) not null default 0 check (price_usd >= 0),
  -- The words under the price ("forever", "per month"). Display only.
  cadence                   text        not null default 'per month',
  -- The machine-readable period, for the renewal arithmetic.
  billing_period            text        not null default 'monthly',
  credits                   integer     not null default 0 check (credits >= 0),
  max_concurrent_jobs       integer     not null default 2 check (max_concurrent_jobs > 0),
  max_generations_per_hour  integer     not null default 20 check (max_generations_per_hour > 0),
  -- Upgrade/downgrade ordering. Comparing prices breaks the moment a tier is
  -- discounted; comparing rank never does.
  rank                      integer     not null default 0,
  perks                     text[]      not null default '{}',
  cta_label                 text,
  is_popular                boolean     not null default false,
  is_visible                boolean     not null default true,
  sort_order                integer     not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null,

  constraint plans_billing_period_allowed
    check (billing_period in ('monthly', 'yearly', 'lifetime', 'none'))
);

create index if not exists plans_order_idx on public.plans (sort_order) where is_visible;

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- plan_features — the comparison matrix
--
-- `values` is jsonb keyed by plan id: {"free": false, "pro": true,
-- "enterprise": "Priority"}. A boolean renders as a tick or a dash, a string
-- renders as itself, and a plan id with no entry renders as a dash — so adding
-- a row does not require filling in every column before it is publishable.
-- ---------------------------------------------------------------------
create table if not exists public.plan_features (
  id         uuid primary key default gen_random_uuid(),
  label      text        not null,
  values     jsonb       not null default '{}'::jsonb,
  sort_order integer     not null default 0,
  is_visible boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_features_label_len check (char_length(label) between 1 and 120),
  constraint plan_features_values_is_object check (jsonb_typeof(values) = 'object')
);

create index if not exists plan_features_order_idx
  on public.plan_features (sort_order) where is_visible;

drop trigger if exists plan_features_touch_updated_at on public.plan_features;
create trigger plan_features_touch_updated_at
  before update on public.plan_features
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- credit_rules — where credits come from
--
-- One row per grant, so a new kind of grant is an insert. `referral_bonus` is
-- seeded disabled: there is no referral flow in this build, and the row exists
-- so the figure is configured before the feature lands rather than hard-coded
-- into it afterwards.
--
-- Not publicly readable. The signup grant is quoted on the landing page, but
-- it reaches the page through the `signup_credits` stat and the free plan's
-- `credits` — both of which are public — rather than by exposing the whole
-- grant table to anonymous readers.
-- ---------------------------------------------------------------------
create table if not exists public.credit_rules (
  key         text primary key,
  label       text        not null,
  description text,
  amount      integer     not null default 0 check (amount >= 0),
  enabled     boolean     not null default true,
  sort_order  integer     not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,

  constraint credit_rules_key_shape check (key ~ '^[a-z][a-z0-9_]{1,40}$')
);

drop trigger if exists credit_rules_touch_updated_at on public.credit_rules;
create trigger credit_rules_touch_updated_at
  before update on public.credit_rules
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- AI CATALOGUE
-- =====================================================================

-- ---------------------------------------------------------------------
-- ai_providers — the connectable-vendor catalogue, in the database
--
-- `id` is the `provider_name` enum value as text, which is the same string that
-- names a vendor on a generation row, keys `user_provider_keys`, and picks a
-- driver in services/ai/ai-router.ts. Text rather than the enum type so a row
-- can be written the moment a vendor is added to lib/ai/catalogue.ts, without
-- waiting on an enum migration — and `generation_ready` is what decides whether
-- anything routes to it.
--
-- `generation_ready` is NOT operator-editable in the admin UI even though the
-- column is writable: a driver either exists in services/ai/providers/ or it
-- does not, and a switch that claims otherwise would produce jobs that fail and
-- refund. The admin form shows it read-only, derived from the code catalogue.
-- ---------------------------------------------------------------------
create table if not exists public.ai_providers (
  id               text primary key,
  label            text        not null,
  description      text        not null default '',
  logo_url         text,
  logo_media_id    uuid references public.media_assets (id) on delete set null,
  -- 'image' | 'video' | 'both' — what the vendor can produce.
  media            text        not null default 'both',
  console_url      text,
  docs_url         text,
  key_placeholder  text        not null default '',
  key_min_length   integer     not null default 16 check (key_min_length between 4 and 512),
  -- A deliberately loose shape hint, mirrored from lib/ai/catalogue.ts. It
  -- catches a pasted email before a network round trip; it is not a gate.
  key_pattern      text,
  is_recommended   boolean     not null default false,
  is_enabled       boolean     not null default true,
  generation_ready boolean     not null default false,
  status           text        not null default 'active',
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null,

  constraint ai_providers_media_allowed check (media in ('image', 'video', 'both')),
  constraint ai_providers_status_allowed
    check (status in ('active', 'beta', 'deprecated', 'disabled'))
);

create index if not exists ai_providers_order_idx
  on public.ai_providers (sort_order) where is_enabled;

drop trigger if exists ai_providers_touch_updated_at on public.ai_providers;
create trigger ai_providers_touch_updated_at
  before update on public.ai_providers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- app_provider_keys — the operator's shared vendor keys
--
-- The second step of the routing chain in services/ai/ai-router.ts: a user's
-- own key wins, and this covers everyone who has not connected one. Until now
-- that fallback could only come from an environment variable, which means a
-- redeploy to rotate a key. This table is read first and the env var is the
-- fallback, so `serverProviderKey()` keeps working untouched on a deployment
-- that never opens the admin panel.
--
-- Sealed with the same AES-256-GCM box as `user_provider_keys` and under the
-- same rule: `ciphertext` never leaves the server, and the UI renders
-- `sk-••••••••1234` from the stored fragments rather than from a decryption.
--
-- RLS at the bottom of this file is enabled with NO policies and the grants are
-- revoked, exactly as migration 0007 did for the user vault and for the same
-- reason: a policy letting `authenticated` read its own row would put a vendor
-- credential one PostgREST call from any browser holding a JWT.
-- ---------------------------------------------------------------------
create table if not exists public.app_provider_keys (
  provider         text primary key,
  label            text,
  ciphertext       text        not null,
  key_prefix       text        not null default '',
  last4            text        not null default '',
  status           public.provider_key_status not null default 'unverified',
  last_verified_at timestamptz,
  last_error       text,
  -- Rotation trail. The previous ciphertext is not kept: a rotated key should
  -- stop existing, and a "previous value" column is a second copy of a secret
  -- for no operational gain.
  rotated_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null,

  constraint app_provider_keys_last4_len check (char_length(last4) <= 8),
  constraint app_provider_keys_prefix_len check (char_length(key_prefix) <= 12),
  constraint app_provider_keys_label_len check (label is null or char_length(label) <= 48)
);

drop trigger if exists app_provider_keys_touch_updated_at on public.app_provider_keys;
create trigger app_provider_keys_touch_updated_at
  before update on public.app_provider_keys
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- ai_models — presentation metadata for a registry model
--
-- `id` is the registry id from lib/ai/registry.ts. This table decides what a
-- visitor is TOLD about a model — the name on the card, the description, the
-- image, the tags, whether it appears on the landing page and in what order.
-- It decides nothing about execution: `routes`, `credits` and `supports` stay
-- in the registry, where they are unit tested and cannot be edited by someone
-- writing marketing copy.
--
-- `status` is therefore a display state. A row set to 'hidden' disappears from
-- the landing model library and the admin's own featured lists; it does not
-- remove the model from the composer, because a model a preset references must
-- stay runnable or that preset breaks. The admin UI says this on the form.
-- ---------------------------------------------------------------------
create table if not exists public.ai_models (
  id            text primary key,
  label         text        not null,
  provider_id   text        references public.ai_providers (id) on delete set null,
  description   text        not null default '',
  -- The open model underneath, named plainly ("FLUX.1 [schnell]").
  basis         text,
  use_case      text,
  image_url     text,
  media_id      uuid references public.media_assets (id) on delete set null,
  category      text,
  tags          text[]      not null default '{}',
  capabilities  text[]      not null default '{}',
  input_types   text[]      not null default '{}',
  output_types  text[]      not null default '{}',
  is_recommended boolean    not null default false,
  is_featured   boolean     not null default false,
  show_on_landing boolean   not null default true,
  status        text        not null default 'active',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,

  constraint ai_models_status_allowed
    check (status in ('active', 'beta', 'deprecated', 'hidden'))
);

create index if not exists ai_models_landing_idx
  on public.ai_models (sort_order) where show_on_landing and status <> 'hidden';

create index if not exists ai_models_tags_idx on public.ai_models using gin (tags);

drop trigger if exists ai_models_touch_updated_at on public.ai_models;
create trigger ai_models_touch_updated_at
  before update on public.ai_models
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- content_categories — one table, several scopes
--
-- Presets, published shots, models and media each have a category vocabulary,
-- and each one wanted a label, a description, an order and a visibility flag.
-- Four near-identical tables is four near-identical admin screens; `scope`
-- makes it one.
--
-- For scope 'explore' this table is metadata only. The enforcement point for a
-- published shot's categories is the `generations_categories_allowed` check
-- constraint, mirrored by lib/categories.ts and guarded by
-- tests/categories.test.ts — a row here cannot widen what a generation may be
-- tagged with, and the admin form says so.
-- ---------------------------------------------------------------------
create table if not exists public.content_categories (
  id          uuid primary key default gen_random_uuid(),
  scope       text        not null,
  slug        text        not null,
  label       text        not null,
  description text,
  icon        text,
  media_id    uuid references public.media_assets (id) on delete set null,
  sort_order  integer     not null default 0,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint content_categories_scope_allowed
    check (scope in ('preset', 'explore', 'model', 'media', 'faq')),
  constraint content_categories_slug_shape check (slug ~ '^[a-z0-9][a-z0-9_-]{0,48}$')
);

create unique index if not exists content_categories_scope_slug_key
  on public.content_categories (scope, slug);

create index if not exists content_categories_scope_idx
  on public.content_categories (scope, sort_order) where is_visible;

drop trigger if exists content_categories_touch_updated_at on public.content_categories;
create trigger content_categories_touch_updated_at
  before update on public.content_categories
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- MEDIA LIBRARY
-- =====================================================================

-- ---------------------------------------------------------------------
-- media_assets, extended
--
-- The table arrived in 0011 as a catalogue of URLs someone else hosts. A media
-- manager also has to hold what an operator uploads, which needs a storage path
-- to delete by, a mime type and a size to show, a folder to organise by, and a
-- record of who put it there.
--
-- `url ~ '^https://'` is the one existing constraint worth noting: a Supabase
-- Storage public URL is https, so uploads satisfy it unchanged and the check
-- stays as the guard against a relative path sneaking in.
-- ---------------------------------------------------------------------
alter table public.media_assets add column if not exists title text;
alter table public.media_assets add column if not exists folder text not null default 'library';
alter table public.media_assets add column if not exists storage_path text;
alter table public.media_assets add column if not exists mime_type text;
alter table public.media_assets add column if not exists size_bytes bigint;
alter table public.media_assets add column if not exists source text not null default 'external';
alter table public.media_assets
  add column if not exists uploaded_by uuid references public.profiles (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'media_assets_source_allowed'
  ) then
    alter table public.media_assets
      add constraint media_assets_source_allowed check (source in ('external', 'upload'));
  end if;
end;
$$;

create index if not exists media_assets_folder_idx on public.media_assets (folder, sort_order);

-- A storage object may back at most one row, so deleting a row can safely
-- delete the object without orphaning another row's image.
create unique index if not exists media_assets_storage_path_key
  on public.media_assets (storage_path) where storage_path is not null;

-- =====================================================================
-- MODERATION AND ACCOUNT STATE
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — account state
--
-- `status` is additive and defaults to 'active', so every existing row keeps
-- behaving exactly as it did. Enforcement is in src/lib/supabase/middleware.ts
-- and the admin guard, not in a policy: RLS on `profiles` is own-row and a
-- suspended user can still read their own profile — which is what the
-- suspension notice needs in order to explain itself.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists status public.account_status not null default 'active';
alter table public.profiles add column if not exists status_reason text;
alter table public.profiles add column if not exists status_changed_at timestamptz;
alter table public.profiles
  add column if not exists status_changed_by uuid references public.profiles (id) on delete set null;
-- A suspension with an end date lifts itself. A ban has none.
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists notes text;

create index if not exists profiles_status_idx on public.profiles (status)
  where status <> 'active';

create index if not exists profiles_role_idx on public.profiles (role)
  where role <> 'user';

-- ---------------------------------------------------------------------
-- generations — moderation record
--
-- `moderation_status` defaults to 'approved' so no existing read path changes:
-- the Explore feed still filters on `visibility` and `deleted_at`, exactly as
-- it did. Hiding a shot from the admin panel sets `visibility = 'private'` —
-- the mechanism the feed already enforces — and records 'hidden' here as the
-- reason. The status is the audit trail; visibility is the enforcement.
-- ---------------------------------------------------------------------
alter table public.generations
  add column if not exists moderation_status public.content_moderation_status
  not null default 'approved';
alter table public.generations add column if not exists is_featured boolean not null default false;
alter table public.generations add column if not exists moderation_note text;
alter table public.generations add column if not exists moderated_at timestamptz;
alter table public.generations
  add column if not exists moderated_by uuid references public.profiles (id) on delete set null;

create index if not exists generations_featured_public_idx
  on public.generations (created_at desc)
  where is_featured and visibility = 'public' and status = 'succeeded' and deleted_at is null;

create index if not exists generations_moderation_idx
  on public.generations (moderation_status, created_at desc)
  where moderation_status <> 'approved';

-- ---------------------------------------------------------------------
-- comments — moderation
--
-- `is_hidden` rather than a hard delete: a moderator hiding a comment should be
-- reversible, and the thread's `comment_count` on the generation row stays
-- honest about what was said. services/comment.service.ts filters on it.
-- ---------------------------------------------------------------------
alter table public.comments add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists hidden_at timestamptz;
alter table public.comments
  add column if not exists hidden_by uuid references public.profiles (id) on delete set null;

create index if not exists comments_hidden_idx on public.comments (created_at desc)
  where is_hidden;

-- =====================================================================
-- AUDIT AND LOGS
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_log — every admin mutation
--
-- Append-only by convention and by grant: there is no update or delete path in
-- the application, and RLS denies everything to anon and authenticated. The
-- actor's email and role are denormalised because the point of an audit row is
-- to still make sense after the account that wrote it is gone.
--
-- `before`/`after` hold the changed fields only, not whole rows, and
-- src/lib/admin/audit.ts redacts anything whose key looks like a secret before
-- it gets here. An audit trail that logs the key someone rotated is a second
-- copy of the key.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_email text,
  actor_role  text,
  action      text        not null,
  entity      text        not null,
  entity_id   text,
  summary     text        not null default '',
  before      jsonb,
  after       jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- system_logs — application events
--
-- Distinct from `audit_log` on purpose. An audit row answers "who changed
-- this"; a system row answers "what happened" — a provider timeout, a failed
-- sweep, a sign-in. Mixing them makes both harder to read, and the retention
-- either table wants is different.
-- ---------------------------------------------------------------------
create table if not exists public.system_logs (
  id         uuid primary key default gen_random_uuid(),
  level      public.log_level not null default 'info',
  source     text        not null default 'app',
  event      text        not null,
  message    text        not null default '',
  context    jsonb,
  user_id    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists system_logs_created_idx on public.system_logs (created_at desc);
create index if not exists system_logs_level_idx on public.system_logs (level, created_at desc);
create index if not exists system_logs_source_idx on public.system_logs (source, created_at desc);
create index if not exists system_logs_user_idx on public.system_logs (user_id, created_at desc)
  where user_id is not null;

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- admin_adjust_credits — the operator's credit grant or clawback
--
-- Deliberately a function rather than an update in TypeScript, for the same
-- reason `spend_credits` is: the balance and the ledger row must move together
-- or the money trail is fiction. The profile row is locked first, so two
-- admins adjusting at once serialise instead of both writing from the same
-- stale read.
--
-- A clawback larger than the balance settles at zero rather than failing —
-- `profiles.credits` has a `>= 0` check, and an operator zeroing an account
-- means "take it all", not "fail if it is not exactly enough". The ledger
-- records the delta that was actually applied, never the one that was asked
-- for, so `balance_after` and the sum of deltas still agree.
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_delta   integer,
  p_note    text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_applied integer;
begin
  if p_delta = 0 then
    raise exception 'DELTA_ZERO' using errcode = 'P0001';
  end if;

  select credits into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Clamp a clawback at the balance. See the note above: the applied delta is
  -- what gets written, so the ledger never claims to have removed credits that
  -- were not there.
  v_applied := greatest(p_delta, -v_balance);
  if v_applied = 0 then
    return v_balance;
  end if;

  update public.profiles
    set credits = credits + v_applied
    where id = p_user_id
    returning credits into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, note)
  values (p_user_id, v_applied, 'admin_adjust', v_balance, coalesce(p_note, 'Adjusted by an administrator'));

  return v_balance;
end;
$$;

-- Only the service role. There is no version of this an end user should reach,
-- and the default `public` grant on a new function would give them one.
revoke all on function public.admin_adjust_credits(uuid, integer, text) from public;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------
-- admin_overview — the dashboard's numbers, in one round trip
--
-- Eleven counts as eleven PostgREST calls is eleven waits on the one page an
-- operator opens first. Returning a single json object costs one.
--
-- Every count is scoped the way the product counts things elsewhere: soft
-- deleted rows are excluded, and "public" means what the Explore feed's own
-- predicate means.
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'users',              (select count(*) from public.profiles),
    'users_active',       (select count(*) from public.profiles where status = 'active'),
    'users_suspended',    (select count(*) from public.profiles where status <> 'active'),
    'users_new_7d',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'staff',              (select count(*) from public.profiles where role <> 'user'),
    'projects',           (select count(*) from public.projects where deleted_at is null),
    'generations',        (select count(*) from public.generations where deleted_at is null),
    'generations_24h',    (select count(*) from public.generations where created_at > now() - interval '24 hours'),
    'generations_failed', (select count(*) from public.generations where status = 'failed' and deleted_at is null),
    'generations_running',(select count(*) from public.generations where status in ('queued', 'running')),
    'assets',             (select count(*) from public.assets),
    'public_shots',       (select count(*) from public.generations
                            where visibility = 'public' and status = 'succeeded' and deleted_at is null),
    'comments',           (select count(*) from public.comments where not is_hidden),
    'comments_hidden',    (select count(*) from public.comments where is_hidden),
    'credits_held',       (select coalesce(sum(credits), 0) from public.profiles),
    'credits_spent_30d',  (select coalesce(-sum(delta), 0) from public.credit_ledger
                            where delta < 0 and created_at > now() - interval '30 days'),
    'subscriptions_paid', (select count(*) from public.subscriptions
                            where plan <> 'free' and status in ('active', 'trialing', 'past_due')),
    'revenue_minor_30d',  (select coalesce(sum(amount_pence), 0) from public.payment_transactions
                            where status = 'succeeded' and created_at > now() - interval '30 days'),
    'media',              (select count(*) from public.media_assets where is_active),
    'presets',            (select count(*) from public.presets where is_active),
    'errors_24h',         (select count(*) from public.system_logs
                            where level = 'error' and created_at > now() - interval '24 hours')
  );
$$;

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to service_role;

-- ---------------------------------------------------------------------
-- admin_daily_series — generations, signups and spend by day
--
-- Left-joined onto a generated date series, so a day with no activity comes
-- back as a zero rather than as a gap the chart has to guess at.
-- ---------------------------------------------------------------------
create or replace function public.admin_daily_series(p_days integer default 30)
returns table (
  day             date,
  generations     bigint,
  signups         bigint,
  credits_spent   bigint,
  revenue_minor   bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with span as (
    select generate_series(
      (current_date - (greatest(least(p_days, 365), 1) - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    span.day,
    (select count(*) from public.generations g
      where g.created_at::date = span.day and g.deleted_at is null),
    (select count(*) from public.profiles p where p.created_at::date = span.day),
    (select coalesce(-sum(l.delta), 0) from public.credit_ledger l
      where l.created_at::date = span.day and l.delta < 0),
    (select coalesce(sum(t.amount_pence), 0) from public.payment_transactions t
      where t.created_at::date = span.day and t.status = 'succeeded')
  from span
  order by span.day;
$$;

revoke all on function public.admin_daily_series(integer) from public;
grant execute on function public.admin_daily_series(integer) to service_role;

-- =====================================================================
-- ROW LEVEL SECURITY
--
-- Two shapes only.
--
--   Public read: content a visitor's page render needs. SELECT to anon and
--   authenticated, filtered to the visible rows. No insert, update or delete
--   policy exists for either role on any table in this file, so the service
--   role behind the admin guard is the only way content changes.
--
--   Zero policies: operational data. RLS on with nothing granted denies
--   everything to anon and authenticated; the service role bypasses RLS and is
--   the only reader.
-- =====================================================================

-- ------------------------------- public read -------------------------------

alter table public.app_settings enable row level security;
drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated
  -- `is_secret` is belt and braces: nothing should ever be both public and
  -- secret, and if a careless insert makes it so, this is what stops it.
  using (is_public and not is_secret);

alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_select_all on public.feature_flags;
create policy feature_flags_select_all on public.feature_flags
  for select to anon, authenticated using (true);

alter table public.landing_sections enable row level security;
drop policy if exists landing_sections_select_visible on public.landing_sections;
create policy landing_sections_select_visible on public.landing_sections
  for select to anon, authenticated using (is_visible);

alter table public.site_features enable row level security;
drop policy if exists site_features_select_visible on public.site_features;
create policy site_features_select_visible on public.site_features
  for select to anon, authenticated using (is_visible);

alter table public.site_stats enable row level security;
drop policy if exists site_stats_select_visible on public.site_stats;
create policy site_stats_select_visible on public.site_stats
  for select to anon, authenticated using (is_visible);

alter table public.faq_entries enable row level security;
drop policy if exists faq_entries_select_visible on public.faq_entries;
create policy faq_entries_select_visible on public.faq_entries
  for select to anon, authenticated using (is_visible);

alter table public.testimonials enable row level security;
drop policy if exists testimonials_select_visible on public.testimonials;
create policy testimonials_select_visible on public.testimonials
  for select to anon, authenticated using (is_visible);

alter table public.announcements enable row level security;
drop policy if exists announcements_select_live on public.announcements;
create policy announcements_select_live on public.announcements
  for select to anon, authenticated
  -- The window is enforced here as well as in the query. A banner that expired
  -- should not be one forgotten `.lte()` away from reappearing.
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

alter table public.workflow_steps enable row level security;
drop policy if exists workflow_steps_select_visible on public.workflow_steps;
create policy workflow_steps_select_visible on public.workflow_steps
  for select to anon, authenticated using (is_visible);

alter table public.nav_links enable row level security;
drop policy if exists nav_links_select_visible on public.nav_links;
create policy nav_links_select_visible on public.nav_links
  for select to anon, authenticated using (is_visible);

alter table public.plans enable row level security;
drop policy if exists plans_select_visible on public.plans;
create policy plans_select_visible on public.plans
  for select to anon, authenticated using (is_visible);

alter table public.plan_features enable row level security;
drop policy if exists plan_features_select_visible on public.plan_features;
create policy plan_features_select_visible on public.plan_features
  for select to anon, authenticated using (is_visible);

alter table public.ai_providers enable row level security;
drop policy if exists ai_providers_select_enabled on public.ai_providers;
create policy ai_providers_select_enabled on public.ai_providers
  for select to anon, authenticated using (is_enabled);

alter table public.ai_models enable row level security;
drop policy if exists ai_models_select_visible on public.ai_models;
create policy ai_models_select_visible on public.ai_models
  for select to anon, authenticated using (status <> 'hidden');

alter table public.content_categories enable row level security;
drop policy if exists content_categories_select_visible on public.content_categories;
create policy content_categories_select_visible on public.content_categories
  for select to anon, authenticated using (is_visible);

-- ------------------------------ zero policies ------------------------------

-- The operator's vendor keys. Same treatment as `user_provider_keys` in 0007:
-- RLS forced, grants revoked, service role only.
alter table public.app_provider_keys enable row level security;
alter table public.app_provider_keys force row level security;
revoke all on public.app_provider_keys from anon, authenticated;

-- Grant amounts are operational configuration, not marketing copy.
alter table public.credit_rules enable row level security;
alter table public.credit_rules force row level security;
revoke all on public.credit_rules from anon, authenticated;

-- An audit trail a client can read is a map of the admin surface.
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
revoke all on public.audit_log from anon, authenticated;

alter table public.system_logs enable row level security;
alter table public.system_logs force row level security;
revoke all on public.system_logs from anon, authenticated;
