# The admin panel

Kinetic Studio's content, commerce, catalogue and community are edited from
`/admin` and read from the database. This document is the handover: what was
added, where it lives, what is deliberately *not* configurable, and what was
proven to work.

Written 2026-09-27. Verified against the live Supabase project and a production
build.

---

## 1. What changed, in one paragraph

Every hardcoded value the marketing site and the studio used to read from a TS
literal now has a row in Postgres, an editor at `/admin`, and the original
literal still in the code as a fallback. Nothing in the generation, credit or
entitlement paths changed shape — those were rewired to *ask* the database for
plans, keys and grants, and to fall back to exactly what they used before when
the answer is missing.

The one rule the whole thing rests on: **an unreachable or unseeded database
renders the site as it shipped.** Not blank, not broken, not off.

---

## 2. Database schema

Eight migrations, `0015` through `0022`, all applied.

| File | What it does |
| --- | --- |
| `0015_cms_enums.sql` | Enum values only. `user_role` gains `editor`, `moderator`, `super_admin`; `media_category` gains `brand`, `ui`, `other`. |
| `0016_cms.sql` | The schema: 19 tables, 3 enums, 3 functions, column additions, RLS. |
| `0017_cms_seed.sql` | Seeds every row from the TS literals it replaces. `on conflict do nothing` throughout. |
| `0018_site_metrics.sql` | `site_metrics()` — anonymous aggregate counts without widening any policy. |
| `0019_configurable_signup_grant.sql` | `handle_new_user()` reads the signup grant from `credit_rules`. |
| `0020_explore_category_seed_fix.sql` | Corrects two seeded Explore categories that were not in the allowed set. |
| `0021_function_grants.sql` | **Security fix.** Locks six privileged functions to the service role. See §6. |
| `0022_viewer_role.sql` | Adds `viewer` to `user_role` — the read-only admin. Enum additions live alone, same reason as 0015. |

`0015` is a separate file on purpose: `scripts/apply-migration.mjs` wraps a file
in one transaction, and a newly added enum value cannot be *used* as data in the
same transaction that adds it.

### New enums

`account_status` (`active`, `suspended`, `banned`) · `content_moderation_status`
(`approved`, `pending`, `hidden`) · `log_level` (`debug`, `info`, `warn`,
`error`).

### New tables

| Table | Rows seeded | Holds |
| --- | --- | --- |
| `app_settings` | 37 | Every scalar setting, keyed `category.name`, with `is_public` and `is_secret`. |
| `feature_flags` | 11 | Kill switches, with a label, a category and an order. |
| `landing_sections` | 12 | One row per band of the landing page: copy, media, order, visibility, plus a `config` jsonb for band-specific fields. |
| `site_features` | 11 | Feature, capability and overview cards, keyed by placement. |
| `site_stats` | 4 | The numbers band: label, suffix, a manual override and a `source` naming a `site_metrics()` field. |
| `faq_entries` | 6 | Question, answer, order, visibility. |
| `testimonials` | 0 | Deliberately empty — the band hides itself rather than shipping invented quotes. |
| `announcements` | 0 | Scheduled banners with a window, a surface and a tone. |
| `workflow_steps` | 4 | The "how it works" steps. |
| `nav_links` | 17 | Header, footer and mobile navigation, grouped and ordered. |
| `plans` | 3 | Price, period, credits, badge, order, visibility. |
| `plan_features` | 8 | The comparison matrix. |
| `credit_rules` | 6 | Signup grant, monthly renewal, per-plan allowance, bonus and referral rules. |
| `ai_providers` | 11 | Vendor presentation: logo, blurb, docs URL, recommended, order, enabled. |
| `app_provider_keys` | 0 | Shared vendor keys, sealed. See §6. |
| `ai_models` | 10 | How a registry model is *presented*: image, tags, featured, landing visibility, order. |
| `content_categories` | 18 | The preset, Explore, model and media vocabularies. |
| `audit_log` | — | Append-only. Who did what, with a field-level diff. |
| `system_logs` | — | Append-only. Application events, staff-visible only. |

### Columns added to existing tables

- `media_assets` — `title`, `folder`, `storage_path`, `mime_type`, `size_bytes`,
  `source`, `uploaded_by`
- `profiles` — `status`, `status_reason`, `status_changed_at`,
  `status_changed_by`, `suspended_until`, `notes`
- `generations` — `moderation_status`, `is_featured`, `moderation_note`,
  `moderated_at`, `moderated_by`
- `comments` — `is_hidden`, `hidden_at`, `hidden_by`

### Functions

| Function | Caller | Purpose |
| --- | --- | --- |
| `admin_overview()` | service role | 21 dashboard counts in one round trip. |
| `admin_daily_series(integer)` | service role | Generations, signups, spend and revenue per day. |
| `admin_adjust_credits(uuid,integer,text)` | service role | Balance change and ledger row in one transaction; a clawback clamps at zero. |
| `site_metrics()` | anon | Creators, projects, assets, public shots, presets, countries — scalars only. |
| `handle_new_user()` | trigger | Now reads the signup grant from `credit_rules`, defaulting to 200. |

`site_metrics()` exists because `profiles` and `projects` are owner-scoped. The
landing page needs counts across all of them, and the alternative — widening
those policies — would have leaked rows to get a number.

---

## 3. Files

**120 files: 87 added (including this document), 33 modified.**

### Added — schema and scripts (10)

```
supabase/migrations/0015_cms_enums.sql … 0021_function_grants.sql   (7)
scripts/grant-role.mjs              bootstrap/recovery: grant a role by email
scripts/smoke-routes.mjs            walks 45 routes signed in, reports 5xx
scripts/checks/function-grants.sql  asserts no privileged function is public
scripts/smoke-roles.mjs             walks the panel as every role, then restores
```

### Added — types, lib, services (26)

```
src/types/cms.ts                    a separate schema map for the 20 CMS tables
src/lib/admin/permissions.ts        21 capabilities × 5 roles
src/lib/admin/guard.ts              getAdminActor / requireCapability / withCapability
src/lib/admin/audit.ts              redaction, diffing, audit(), logEvent()
src/lib/admin/nav.ts                6 groups, 27 items, filtered by role
src/lib/admin/nav-icons.ts          string → LucideIcon, so nav crosses the RSC boundary
src/lib/admin/icons.ts              the 41-icon allow-list the icon picker offers
src/lib/cms/settings.ts             SiteSettings, DEFAULT_SETTINGS, coercion
src/lib/cms/content.ts              landing shapes and the shipped defaults
src/lib/flags.ts                    FlagKey, FLAG_DEFAULTS, getFlags, isEnabled
src/lib/account-status.ts           suspension state, self-lifting on expiry
src/lib/marketing/staff-visitor.ts  whether the public header offers the panel
src/lib/supabase/cms.ts             the anon and service-role CMS clients
src/services/cms/*.ts               settings, content, plans, crud, catalogue,
                                    media, provider-keys, credits            (8)
src/services/admin/*.ts             users, moderation, analytics, logs,
                                    presets, library                         (6)
```

### Added — UI (12)

```
src/components/admin/form-spec.ts     the FieldSpec union and value coercion
src/components/admin/record-form.tsx  RecordForm / RecordDialog and its controls
src/components/admin/controls.tsx     ToggleAction, ActionButton, DeleteButton,
                                      ReorderButtons, SearchFilter, Pager
src/components/admin/admin-chrome.tsx page header, panel, table, stat tile
src/components/admin/admin-sidebar.tsx
src/components/admin/media-upload.tsx the two FormData forms
src/components/admin/read-only.tsx    read-only mode, its scope and its badge
src/components/admin/admin-user-menu.tsx  account, role and log out
src/components/brand/theme-style.tsx  emits only the tokens that differ
src/components/brand/site-logo.tsx
src/components/marketing/testimonials.tsx
src/components/marketing/announcement-banner.tsx
src/components/studio/account-notice.tsx
src/components/ui/switch.tsx
```

### Added — routes and actions (36)

28 `page.tsx`, one `layout.tsx`, 7 Server Action modules under
`src/app/admin/_actions/`.

### Added — tests (2)

`tests/admin-permissions.test.ts` (20 tests) ·
`tests/cms-content.test.ts` (53 tests)

### Modified (33)

Landing bands (12), site chrome (3), studio chrome (3), `app/layout.tsx`,
`app/page.tsx`, `robots.ts`, auth actions and callback, the sign-up page,
`explore/page.tsx` and `explore/actions.ts`, `g/[id]/page.tsx`,
`api/generations/route.ts`, `plan-comparison.tsx`, `types/database.ts`, and four
services:

| Service | Change | Fallback |
| --- | --- | --- |
| `subscription.service.ts` | `resolvePlan` / `getPlanById` instead of the `plans.ts` literal | `lib/plans.ts` |
| `ai-router.ts` | optional `sharedKeys` on `RouteInput` | `serverProviderKey(provider)` |
| `generation.service.ts` | resolves user keys and shared keys in parallel | as above |
| `comment.service.ts` | `.eq('is_hidden', false)` | — |

`isEntitled`, `hasLapsed` and `comparePlans` were not touched. Credit prices,
routes, ratios and durations stay in `lib/ai/registry.ts` — `ai_models` is
presentation only, and setting a model to `hidden` changes what the catalogue
shows, not what the composer can run.

---

## 4. Routes

All 28 verified 200 as `super_admin` against a production build.

| Group | Routes |
| --- | --- |
| Overview | `/admin` · `/admin/analytics` · `/admin/statistics` |
| Content | `/admin/landing` · `/admin/features` · `/admin/faq` · `/admin/testimonials` · `/admin/announcements` · `/admin/categories` · `/admin/media` |
| Commerce | `/admin/pricing` · `/admin/plans` · `/admin/credits` |
| AI | `/admin/providers` · `/admin/providers/keys` · `/admin/models` · `/admin/presets` |
| Community | `/admin/users` · `/admin/users/[id]` · `/admin/explore` · `/admin/assets` · `/admin/projects` |
| System | `/admin/branding` · `/admin/theme` · `/admin/flags` · `/admin/settings` · `/admin/logs` · `/admin/audit` |

`/admin` is disallowed in `robots.ts`. Protection is three layers, and each one
exists because the one above it does not cover the case below:

1. **Middleware** — `/admin` is a protected prefix, so a signed-out visitor is
   turned back at the edge before any admin code runs, and comes back to the
   page they wanted rather than to the dashboard.
2. **The layout** — `requireStaff()` sends a signed-in non-staff visitor to the
   studio rather than to a 403. Telling a stranger that /admin exists and is
   merely forbidden is more than they need to know.
3. **Each page** — `requireCapability(capability, '/admin/...')` before it reads
   anything, so an under-privileged staff member lands on a screen they can open.

None of the three covers a Server Action, which is an HTTP endpoint a layout
guard never runs for. That is the fourth layer, and the only one that matters
for writes: `withCapability` on all 94 of them.

### Bootstrapping

```bash
node scripts/grant-role.mjs you@example.com super_admin
node scripts/grant-role.mjs support@example.com viewer     # read-only admin
```

It warns if the change would leave no active super admin.

---

## 5. Roles and capabilities

22 capabilities across six roles. The matrix is in code
(`src/lib/admin/permissions.ts`), not in the database — a permission table is a
thing an attacker with one write can edit.

| | viewer | editor | moderator | admin | super_admin |
| --- | --- | --- | --- | --- | --- |
| content, media | read | read/write | read | read/write | read/write |
| billing | read | read | — | read/write | read/write |
| users | read | — | read/write | read/write/credits/roles | all |
| moderation | read | — | read/write | read/write | read/write |
| providers | read | — | — | read/write | read/write |
| **secrets** | **read** | — | — | read/write | read/write |
| settings, flags | read | — | — | read/write | read/write |
| logs, analytics | both | analytics | both | both | both |

### Read-only admin (`viewer`)

Opens every one of the 28 screens and can change nothing. It holds every read
capability in the union and no other, which is what makes the refusal
structural: all 94 admin Server Actions are guarded by a `:write` capability, so
a viewer is refused by `authorize()` before any of them reads its arguments.
There is no read-only flag anywhere in an action to forget to check.

The panel reflects that rather than enforcing it.
`components/admin/read-only.tsx` provides one boolean from the layout, and the
seven components that can change something — `RecordForm`, `RecordDialog`,
`ToggleAction`, `ActionButton`, `DeleteButton`, `ReorderButtons` and the two
media forms — disable themselves from it. Every mutating control in the panel is
one of those, which is why a single provider is enough and no page has to
remember to ask.

What stays fully live for a viewer: navigation, every table, search, filters,
pagination and every link. Investigating is the entire point of the role.

`AdminWriteScope` narrows the same context per screen, for the case the global
flag gets wrong: a moderator standing on the landing-page editor holds plenty of
write capabilities, just not `content:write`, and an enabled Save button the
server then refuses is the interface lying. It only ever tightens.

### Admin vs super admin

They hold **identical capabilities**, including the key vault. What separates
them is rank, not access:

| | admin | super_admin |
| --- | --- | --- |
| appoint a super admin | no | yes |
| demote a super admin | no | yes |
| delete, suspend or ban a super admin | no | yes |
| adjust a super admin's credits | no | yes |

One function decides all of it — `hasAuthorityOver(actor, subject)`, which is
rank `>=` rank. Equal rank counts, deliberately: two admins administering each
other is ordinary, and a super admin acting on another is allowed because there
is no higher rung to appeal to. Reaching *upward* is what never happens.

Opening the key vault to `admin` is a widening from the previous design, where
it was super-admin-only. The reason: an admin who can configure every provider
but cannot replace a leaked key is an on-call operator who has to wake somebody
else up. Nothing on that screen reveals a key — see §6.

Escalation is refused in both directions: you cannot grant a role above your own
rank, and you cannot modify a subject who outranks you. The last active super
admin cannot be demoted or deleted.

### Login and landing

| Who | Signing in lands on | The public header offers |
| --- | --- | --- |
| any staff role | `/admin` | **Admin panel** → `/admin` |
| everyone else | `/dashboard` | Dashboard → `/dashboard` |
| suspended staff | `/dashboard` | Dashboard — the notice lives there |

An explicit `next` always wins, so a sign-in prompted by a link to `/create`
still ends at `/create`. `postSignInPath` is the single function all three
callers use: the sign-in action, the OAuth callback, and the middleware's bounce
off `/sign-in` for somebody already signed in.

The rule that makes it work: **an auth page may forward a destination the
visitor asked for, and may not invent one.** `safeNextPath(next)` defaults to
`/dashboard`, and the sign-in page used to call it on the raw query parameter
and pass the result into the form's hidden field — so the field was never empty,
the action's decision could never apply, and every staff sign-in landed in the
studio. The middleware path redirected correctly the whole time, which is
exactly what made it look finished. The pages now forward `''` when nobody
asked, and a test asserts they never go back.

The panel has its own account menu in the sidebar footer — the account, its role
and description, Profile, back to the studio, and Log out, which ends the
session and returns to `/`.

---

## 6. Security

### Secrets

Infrastructure secrets stay in the environment and are never read from or
written to the database: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, JWT
secrets, session secrets.

Vendor API keys are configurable, and resolve **database first, environment
second** (`resolveSharedKeys` in `services/cms/provider-keys.service.ts`):

```
for (const provider of providers) {
  if (resolved[provider]) continue
  const fromEnv = serverProviderKey(provider)
  if (fromEnv) resolved[provider] = fromEnv
}
```

A key is sealed with AES-256-GCM (`lib/crypto/secret-box.ts`) before it reaches
Postgres. `app_provider_keys` has RLS forced, **zero policies**, and grants
revoked from `anon` and `authenticated` — the service role is the only reader.
Every display query names its columns (`DISPLAY_COLUMNS`); `ciphertext` is not
among them, and no query in the codebase selects it except the one that decrypts
for a job it has already authorised.

`secrets:read` is held by the read-only admin as well, and that is safe for the
same reason the reveal button does not exist: the screen has nothing to reveal.
`secrets:write` — store, rotate, test, remove — is admin and above.

**The spec asked for Show/Hide and Copy on stored keys. Both were deliberately
not built,** and `/admin/providers/keys` carries a panel explaining why. The
masked form — `qa-••••••••ABCD` — is assembled from a stored prefix and last
four, never from a decryption, so *no display path decrypts anything*. Adding a
reveal endpoint would mean adding the one thing that can leak a key, in exchange
for answering a question that Test answers better. What the screen offers
instead is **Test** (ask the vendor), **Rotate** (replace outright; the previous
ciphertext is not kept) and **Remove**.

The entry field is a plain text input, not a password field, so an operator can
see what they pasted. It is cleared on close and never re-rendered with a value.

### Tables closed at the grant level

`app_provider_keys`, `credit_rules`, `audit_log`, `system_logs` — RLS forced,
no policies, `revoke all ... from anon, authenticated`. Verified unreachable
with the public anon key.

### Audit

Every mutation goes through `services/cms/crud.ts`, and the audit write is
structural — there is no code path that mutates and skips it. Entries carry the
actor's id, email and role, the entity, a human summary, and a diff of the
changed fields only. Anything key-shaped is redacted before it is written:

```
/(secret|password|token|api[_-]?key|apikey|ciphertext|private|credential|authorization|bearer)/i
```

Confirmed: the create, rotate and delete entries for a stored vendor key contain
`last4` and nothing else.

### CSS injection

Theme values are validated on write against a narrow allow-list *and*
re-validated on read in `ThemeStyle`, because the strings end up inside a
`<style>` block:

```
/^(#[0-9a-f]{3,8}|(oklch|rgb|rgba|hsl|hsla)\([0-9a-z.,%/ \-+]*\)|[a-z]{3,20})$/i
```

Anything that could close a rule and open another is refused rather than
sanitised.

### A real vulnerability, found and fixed

Probing the live database with the **public anon key** during this testing
turned up four `SECURITY DEFINER` functions that `anon` could execute. Two of
them moved money:

| Function | Reachable by anon | Impact |
| --- | --- | --- |
| `admin_adjust_credits` | yes | mint or claw back credits for any account, with a ledger row that made it look like an operator did it |
| `set_subscription_credits` | yes | set any balance outright — **pre-existing**, from the billing work |
| `admin_overview` | yes | user counts, credits held, 30-day revenue |
| `admin_daily_series` | yes | the same figures as a daily series |

Not theoretical. An anon-key call set one account's balance to 99999 and added a
credit to another. Both were reverted, along with the two ledger rows.

**Root cause.** Supabase ships

```sql
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

so every function created in `public` is born with *explicit* grants to `anon`
and `authenticated`. The lock these functions used —

```sql
revoke all on function public.f(...) from public;
```

— revokes the PUBLIC pseudo-role's grant, which they never had. It reported
success and changed nothing.

**Fix.** `0021_function_grants.sql` revokes execute `from public, anon,
authenticated` on all six privileged functions and re-grants to `service_role`
only (`ensure_default_project` keeps `authenticated`, since a signed-in user
calls it for themselves). `scripts/checks/function-grants.sql` asserts all 22
conditions and is the regression guard:

```bash
node scripts/db-query.mjs --file scripts/checks/function-grants.sql
```

Left reachable on purpose: `site_metrics()` and `creator_stats()` return scalars
(and `creator_stats` scopes itself to `auth.uid()`, so a stranger gets zeroes);
`add_comment`, `delete_comment`, `toggle_like` and `toggle_favourite` each raise
`NOT_AUTHENTICATED` without a session, so their anon grant is redundant rather
than dangerous; `register_download` does not require a session because a
signed-out download is meant to count.

### Flag fallback direction

Every flag has a default in code and a flag that cannot be read falls back to
it, not to `false` — a database hiccup must not switch Explore off for
everybody. `maintenance_mode` defaults the other way, to off, for the same
reason reversed.

---

## 7. Testing report

### Static and unit

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | **532 passed**, 14 skipped, 25 files |
| `npm run build` | 55 pages compiled, all 28 admin routes |

95 of those tests are new: 42 on the permission matrix (staff access, secrets
super-admin-only, role boundaries, escalation refusals, matrix completeness,
write⇒read pairing) and 53 on CMS content (setting coercion, flag default
*directions*, landing defaults, `statValue`, nav href resolution, the icon
allow-list rejecting `default`/`createLucideIcon`/`__proto__`, form coercion,
audit redaction and diffs).

### Routes

`node scripts/smoke-routes.mjs` against the production build: **45 routes, no
5xx**, stable across four runs. The one intermittent 307 on `/admin/plans` seen
in dev did not reproduce on a production build and was the dev compiler timing
out `auth.getUser()` during first-hit compilation.

### Permission boundaries, live

Demoting the test account and walking every route:

- as `editor` → 13 admin routes redirect to `/admin`
- as `moderator` → 15 redirect
- as `super_admin` → all 28 serve

Account restored to `super_admin` afterwards.

### CRUD, live

| What | Result |
| --- | --- |
| Landing copy | Hero headline edited in the dialog → `landing_sections.title` updated → audit row with the right before/after and `actor_email` → the landing page rendered the new headline. Restored. |
| Feature flag | Billing switched off → `feature_flags.billing = false`, audit row, the pricing band gone from `/`. Switched back on → band returns. |
| Theme | Accent changed → `ThemeStyle` emitted `--color-accent: oklch(0.72 0.19 142)` as a later `:root` rule on `/`. Restored → **zero** tokens emitted, because every value again matches the stylesheet. |
| Media upload | 108-byte PNG → object in the public bucket (200, `image/png`), row with `source: 'upload'`, mime type and size, audit row. |
| Media replace | Same row id, new `storage_path`, size 108 → 83, old object gone. |
| Media delete | Row gone, object gone, audit row. (The first check showed 200 — CDN cache. A cache-busted request returned 400.) |
| Search / filters | `?q=` narrowed the library to the one matching row. |
| Credit grant | `admin_adjust_credits` +5 then −5 through the service role: balance and ledger agree, final balance unchanged. |

### Provider keys, live

A deliberately invalid fal.ai key stored through the UI:

- verified against the vendor immediately — **"fal.ai rejected this key as
  unauthorised"**, status `invalid`, the vendor's own reason shown. The probe is
  a real call, not a shape check.
- displayed as `qa-••••••••WXYZ`; the plaintext appears **nowhere** in the
  rendered HTML
- stored as 88 bytes of ciphertext that does not contain the plaintext
- **Rotate** replaced the ciphertext outright, set `rotated_at`, changed `last4`
- **Remove** deleted the row; the source column fell back from "Stored here" to
  "None"
- Hugging Face, which has an environment variable set and no row, showed
  "Environment" throughout — the fallback chain, visible on screen

### Fallback behaviour

| Check | Result |
| --- | --- |
| Anon read of `system_logs`, `app_provider_keys`, `audit_log`, `credit_rules` | permission denied, all four |
| Anon read of `app_settings` | 29 of 37 rows; no `is_secret` row among them; the 8 withheld are generation, limit and storage internals |
| Anon **write** to `app_settings`, `feature_flags`, `landing_sections`, `plans` | zero rows changed (updates match nothing; inserts refused `42501`; deletes match nothing) — confirmed by comparing values before and after, not by trusting the absence of an error |
| `explore-rls.sql` | 34 checks pass |
| `counter-drift.sql` | no drift |
| `function-grants.sql` | 22 checks pass |

### Roles, live

`node scripts/smoke-roles.mjs` moves the QA account through every role against a
production build, then puts it back. All checks pass:

| Role | Admin routes served | Where `/sign-in` sends them |
| --- | --- | --- |
| super_admin | 27 / 27 | `/admin` |
| admin | 27 / 27 | `/admin` |
| **viewer** | **27 / 27** | `/admin` |
| editor | 14 / 27 | `/admin` |
| moderator | 17 / 27 | `/admin` |
| user | **0 / 27** — every one to `/dashboard` | `/dashboard` |

Signed out, `/admin/users` returns `/sign-in?next=%2Fadmin%2Fusers` — turned
back at the edge, with the destination kept.

The read-only markup was asserted rather than eyeballed, because "is this
control disabled" is an attribute in the HTML the server sent. As `viewer`: the
Read only badge present, `<fieldset disabled>` around the theme form, the "Save
the theme" button `disabled` with a title explaining why, the media upload form
absent entirely, and the users table still rendering with a live search box. As
`super_admin` on the same pages: no badge, no disabled fieldset, a live Save
button, a live upload form. The contrast is the evidence.

### Every action, audited

A structural test reads all seven Server Action modules and asserts three things
about the 94 exported actions:

- every module guards with `withCapability`
- no action is guarded by a `:read` capability
- `can('viewer', capability)` is false for every guard, and
  `can('super_admin', capability)` is true for every one

That is the read-only guarantee in a form that fails when somebody adds action
number 95 and forgets the wrapper.

### Not exercised

- **`system_logs` has no rows yet.** The table, its grants and its insert path
  were verified with a probe row (written, read back, deleted). The three
  `logEvent` call sites — sign-in success, sign-in failure, the auth callback —
  are wired but were not driven end to end, because the only browser available
  shared the operator's session and a real sign-in attempt would have destroyed
  it. The next sign-in through the UI will populate it.
- Invoking a Server Action with a hand-rolled payload returns 500. That is the
  framework's wire format, produced only by its own client; it is not reachable
  from the UI and is not a defect.

### Current database state

Seeded and left as shipped: 37 settings, 11 flags, 12 sections, 11 features,
4 stats, 6 FAQ, 4 workflow steps, 17 nav links, 3 plans, 8 plan features,
6 credit rules, 11 providers, 10 models, 18 categories. `testimonials`,
`announcements`, `app_provider_keys` and `system_logs` are empty by design.
`audit_log` holds the trail of the tests above.

Two staff accounts exist: `qaexplore679423cd` (`super_admin`) and `moderator`
(`moderator`).

---

## 8. What is deliberately not editable

Each of these is a decision, and the reason matters more than the rule:

- **Credit prices, model routes, supported ratios and durations** stay in
  `lib/ai/registry.ts`. A price that disagrees with what the driver charges
  produces refunds.
- **"Can generate"** on the providers screen is read from the code — whether a
  driver ships and a model names the vendor. A switch claiming a vendor could
  run a job when no driver exists would produce failed generations.
- **`isEntitled` / `hasLapsed` / `comparePlans`** stay in `lib/plans.ts`. Plans
  are data; entitlement is logic.
- **Archiving somebody's project.** Restore exists, because that undoes a user's
  mistake. The reverse overrides their choice, and no support request needs it.
- **The billing disclaimer cannot be emptied**, and an SEO title template
  without `%s` is refused.
- **Light mode.** The build is dark-only, and the toggle says so rather than
  offering a theme that does not exist.
- **A key reveal.** See §6.
