# Higgsfield-inspired MVP — Build Plan

Status: planning only, no application code written yet.
Date: 2026-09-19 · Target: one 24-hour development sprint · Repo: `C:\claude-code\higgsfield-ai-clone`
Revision: 3 — stack fixed as **Supabase (Postgres + Auth + Storage) + Vercel**. Revisions 1–2 explored Neon/Prisma and Firebase/Netlify; this is the approved direction.

Working name: **Kinetic** (placeholder). We build a product *inspired by* Higgsfield's interaction model.
We do not copy their brand, logo, copy, or preview media — all preset previews are our own generated or placeholder assets.

---

## 1. What Higgsfield actually is, and which 20% of it carries the experience

Higgsfield is an AI video/image studio whose differentiator is **not** the model — it licenses the same
third-party models everyone else does. The differentiator is the **preset layer wrapped around them**:
cinematic camera moves and visual styles, packaged as one-click cards with looping video previews.

### The core loop

```
Browse preset gallery  ->  Pick a motion/style card  ->  Drop in a start image (or generate one)
        ^                                                          |
        |                                                          v
   Remix from feed  <-  Share to Explore  <-  Library grid  <-  Generate (async job, live progress)
```

### The five things that make it feel like Higgsfield

| # | Trait | Why it matters | Replicate? |
|---|---|---|---|
| 1 | **Preset-first, not prompt-first** | The user brings an image and an idea; the preset carries the prompt engineering, camera language, and model params. This is the entire product thesis. | **Yes — P0** |
| 2 | **Video preset cards that autoplay on hover** | The gallery *is* the marketing. You understand "Crash Zoom" in 800ms by watching it. | **Yes — P0** |
| 3 | **Persistent composer bar** | Image slot + prompt + model + motion + duration + aspect + visible credit cost, always reachable. Keeps the user in flow. | **Yes — P0** |
| 4 | **Async job feed with live progress** | Video takes 30s–3min. Results stream into a grid while you queue the next one. Feels alive; hides latency. | **Yes — P0** |
| 5 | **Explore feed + one-click remix** | Social proof plus the fastest on-ramp: "make this, but mine." Also the best demo moment. | **Yes — P1** |

### Their surface area, ranked by demo impact ÷ build cost

| Feature | Impact | Cost | Verdict |
|---|---|---|---|
| Motion-preset image→video | ★★★★★ | Med | **In** |
| Preset gallery w/ video previews | ★★★★★ | Low | **In** |
| Style-preset text→image ("Soul"-like) | ★★★★☆ | Low | **In** |
| Library + job status | ★★★★☆ | Med | **In** |
| Explore feed + remix | ★★★★☆ | Low | **In** |
| Credits + ledger | ★★★☆☆ | Low | **In** |
| Talking-avatar / lipsync | ★★★☆☆ | High | Out |
| Character consistency / LoRA training | ★★★☆☆ | High | Out |
| Timeline video editor | ★★☆☆☆ | High | Out |
| Product-placement ad templates | ★★☆☆☆ | Med | Out (stretch: one preset category) |
| Upscale / frame interpolation | ★★☆☆☆ | Low | Stretch |
| Stripe billing | ★☆☆☆☆ | Med | Out (credits are seeded; checkout is a stub) |

---

## 2. MVP scope — 24 hours, one developer

### In scope (must ship)

1. **Auth** — Supabase Auth: email/password + Google OAuth, with password reset and email confirmation
   handled by Supabase. New users seeded with 200 credits by a database trigger.
2. **Preset catalog** — ~24 motion presets (Crash Zoom, Dolly Zoom, Bullet Time, 360 Orbit, FPV Drone,
   Whip Pan, Handheld, Snorricam, Crane Up, Push In, Car Chase, Object POV…) + ~12 style presets
   (Polaroid, Fashion Editorial, 35mm Film, Cyberpunk Neon, Golden Hour…). Seeded from JSON, each with
   category, hidden prompt fragment, model params, credit cost, and a preview clip.
3. **Text → image** with style presets and aspect ratio.
4. **Image → video** with motion preset, duration, and aspect ratio. Start frame = upload or a prior generation.
5. **Generation lifecycle** — queued → running → succeeded/failed, streamed to the UI over **Supabase
   Realtime** (Postgres logical replication), with automatic credit refund on failure.
6. **Projects** — generations are organised into user-owned projects (create, rename, delete, set cover);
   a "Default" project is auto-created so the composer never blocks on project setup.
7. **Library / asset management** — the user's generations and assets in a masonry grid; hover-to-play; detail drawer with prompt,
   preset, seed, params; download; "use as start frame"; delete.
8. **Explore feed** — public generations, likes, and **Remix** (prefills the composer with the same
   preset + params, user swaps the image/prompt).
9. **Credits** — per-model cost table, atomic debit at submit inside a `SECURITY DEFINER` Postgres
   function, append-only ledger, balance live in the header.
10. **Mock provider mode** — the whole app runs end-to-end with `AI_PROVIDER=mock` and no model keys,
   returning seeded sample media on a realistic delay. Confirmed as the provider for this sprint.
11. **Polished dark UI** — motion, skeletons, empty states, toasts, keyboard shortcuts, mobile-responsive.

### Explicitly out of scope

Lipsync/avatars · video editing · model training · teams/orgs · real payments · upscaling ·
comments/follows · admin dashboard · i18n · native apps.

### Definition of done

A stranger can sign in, click a preset, upload a photo, generate a video, watch it finish, publish it,
and have a second account remix it — on a deployed Vercel URL, in under three minutes, with no console errors.

---

## 3. Technical architecture

### Stack (approved)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript strict, React 19 | RSC for reads, Server Actions for mutations, route handlers for job submission/sync/webhooks |
| UI | Tailwind CSS v4 · shadcn/ui (hand-vendored) · Radix · Framer Motion · Lucide · Sonner | shadcn components are copied into `src/components/ui`, so no CLI interactivity during the sprint |
| DB | **Supabase Postgres** via `@supabase/supabase-js` | Plain SQL migrations, RLS on every table, no ORM |
| Auth | **Supabase Auth** via `@supabase/ssr` | Email/password + Google OAuth, cookie-based sessions, middleware refresh |
| Storage | **Supabase Storage** | Two buckets: `uploads` (private, user-scoped) and `generations` (public read) |
| Realtime | **Supabase Realtime** on `generations` | Live job feed and live Explore, no polling loop |
| AI | Provider abstraction: `mock` (sprint default) · `fal` · `replicate` | Keys optional; mock is a first-class driver |
| Deploy | **Vercel** | Single project; env vars in the dashboard |
| Validation | Zod at every boundary | Shared schemas between forms, actions, and services |
| Tests | Vitest on credits math, provider adapter, model registry | Pure functions only — no live DB in tests |

### Layering — where logic is allowed to live

```
app/          routing, RSC data fetching, Server Actions   -> may call services, never the DB directly
services/     all business logic and every DB query        -> the only layer that touches Supabase
lib/          framework-level plumbing (clients, AI port, utils, validation)
components/   presentation; receives data as props
```

One rule keeps this honest: **`src/app` never imports `@supabase/supabase-js` directly.** It calls a
service. That single constraint is what makes the codebase feel production-grade without ceremony.

Two Supabase clients exist, deliberately:
- **Anon/user client** (`lib/supabase/server.ts`, `client.ts`) — carries the user's JWT, RLS applies. Used for all reads.
- **Service-role client** (`lib/supabase/admin.ts`) — bypasses RLS, **server-only**, never imported into a client component. Used for credit mutations, provider result writes, and seeding.

### Final folder structure

```
kinetic-studio/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                    root shell, fonts, theme, toaster
│  │  ├─ page.tsx                      premium landing page
│  │  ├─ globals.css                   Tailwind v4 theme tokens
│  │  ├─ (auth)/
│  │  │  ├─ layout.tsx                 split cinematic auth shell
│  │  │  ├─ sign-in/page.tsx
│  │  │  ├─ sign-up/page.tsx
│  │  │  ├─ forgot-password/page.tsx
│  │  │  └─ actions.ts                 Server Actions: signIn, signUp, signOut, resetPassword
│  │  ├─ auth/callback/route.ts        OAuth + email-confirm code exchange
│  │  ├─ (studio)/
│  │  │  ├─ layout.tsx                 sidebar + topbar + credit pill (auth-guarded)
│  │  │  ├─ dashboard/page.tsx         stats, recent generations, quick actions
│  │  │  ├─ create/page.tsx            THE product surface: composer + live job feed
│  │  │  ├─ projects/page.tsx          project grid
│  │  │  ├─ projects/[id]/page.tsx     project detail + its generations
│  │  │  ├─ library/page.tsx           all assets, filters, bulk actions
│  │  │  ├─ history/page.tsx           generation history incl. failed jobs
│  │  │  ├─ explore/page.tsx           public feed + remix
│  │  │  └─ settings/page.tsx          profile, credits ledger
│  │  ├─ g/[id]/page.tsx               public permalink (OG tags)
│  │  └─ api/
│  │     ├─ generations/route.ts               POST create
│  │     ├─ generations/[id]/sync/route.ts     POST advance job
│  │     ├─ uploads/route.ts                   POST signed upload URL
│  │     ├─ cron/sweep/route.ts                stale-job sweeper
│  │     └─ webhooks/[provider]/route.ts       dormant until a real provider is live
│  ├─ services/
│  │  ├─ generation.service.ts   create, sync, list, publish, delete, remix
│  │  ├─ credits.service.ts      spend, refund, balance, ledger  (calls SQL functions)
│  │  ├─ project.service.ts      CRUD + default-project guarantee
│  │  ├─ asset.service.ts        upload, persist provider output, signed URLs, delete
│  │  ├─ preset.service.ts       catalog reads, grouping, featured
│  │  └─ profile.service.ts      profile read/update, handle uniqueness
│  ├─ lib/
│  │  ├─ supabase/{client,server,admin,middleware}.ts
│  │  ├─ ai/
│  │  │  ├─ types.ts             GenerationRequest, ProviderJob, ProviderResult, AIProvider
│  │  │  ├─ registry.ts          model catalog: id, task, cost, latency, capabilities
│  │  │  ├─ index.ts             resolveProvider() + env-based fallback to mock
│  │  │  └─ providers/{mock,fal,replicate}.ts
│  │  ├─ validation/{generation,auth,project}.ts   zod schemas
│  │  ├─ constants.ts            aspect ratios, durations, credit rules
│  │  └─ utils.ts                cn(), formatters, time helpers
│  ├─ components/
│  │  ├─ ui/                     vendored shadcn primitives
│  │  ├─ marketing/              hero, preset reel, feature grid, CTA, footer
│  │  ├─ studio/                 sidebar, topbar, credit-pill, empty-state
│  │  ├─ composer/               composer-bar, model-selector, preset-picker,
│  │  │                          image-drop, aspect-picker, duration-picker
│  │  ├─ gallery/                generation-card, job-card, masonry-grid,
│  │  │                          detail-drawer, video-hover-player
│  │  └─ projects/               project-card, create-project-dialog
│  ├─ hooks/
│  │  ├─ use-generation-feed.ts  Realtime subscription + optimistic insert
│  │  ├─ use-job-ticker.ts       drives /sync while any job is non-terminal
│  │  └─ use-credits.ts
│  ├─ types/database.ts          hand-maintained row types (regenerable via CLI)
│  └─ config/site.ts             name, nav, marketing copy
├─ supabase/migrations/          0001..0005 — see §4
├─ scripts/seed.ts               presets + demo data (service role)
├─ data/presets.json             the preset catalog, source of truth
├─ public/presets/               preview loops + posters
├─ docs/PLAN.md
├─ .env.example
├─ middleware.ts                 session refresh + route protection
└─ next.config.ts · tsconfig.json · postcss.config.mjs · components.json · vercel.json
```

### Request flow for one generation

```
Composer (client)
  │ POST /api/generations { idempotencyKey, task, presetId?, modelId, prompt, imageUrl?, projectId, aspect, duration }
  ▼
Route handler → generation.service.create()
  1 getUser() from the cookie session            (401 if absent)
  2 zod validate · rate limit · resolve preset → model + merged params + credit cost
  3 SQL fn spend_credits(uid, cost, gen_id)      row-locks the profile, writes the ledger,
                                                 raises INSUFFICIENT_CREDITS if short
  4 insert generations row (status=queued)       idempotency_key UNIQUE ⇒ double-submit is a no-op
  5 provider.submit()                            on throw → refund_credits() + status=failed
  ▼
Client: Supabase Realtime subscription on generations(user_id=eq.me) → card re-renders per status write
Client: use-job-ticker POSTs /sync every 3s while any job is non-terminal
  ▼
/sync → provider.poll() → on completion: download media, upload to Storage `generations` bucket,
        insert assets rows, status=succeeded  │  on failure: refund_credits() + status=failed
  ▼
Realtime event → skeleton flips to a playing video
```

**Job advancement on Vercel.** There is no long-running worker, so three layers cover it:
1. **Client ticker** (primary) — snappy while the tab is open.
2. **Opportunistic sweep** — dashboard/create page load triggers a sweep of that user's stale jobs, so a closed tab self-heals on next visit.
3. **`/api/cron/sweep`** — wired in `vercel.json`. Note: Vercel **Hobby caps cron at once per day**, so this is a backstop, not a heartbeat; on Pro it can run every minute. Layers 1–2 are what the demo actually relies on.

---

## 4. Database schema and migrations

Plain SQL in `supabase/migrations/`, applied with `supabase db push` or pasted into the SQL editor.

| File | Contents |
|---|---|
| `0001_schema.sql` | Enums, all seven tables, indexes, `updated_at` triggers |
| `0002_functions.sql` | `handle_new_user()`, `spend_credits()`, `refund_credits()`, `toggle_like()`, `ensure_default_project()` |
| `0003_rls.sql` | Row-level security policies on every table |
| `0004_storage.sql` | `uploads` + `generations` buckets and their access policies |
| `0005_realtime.sql` | Adds `generations` to the `supabase_realtime` publication |

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | 1:1 with `auth.users`, created by trigger | `id → auth.users`, `handle` unique, `credits` default 200, `role` |
| `projects` | User-owned container for generations | `user_id`, `title`, `cover_url`, `is_default` |
| `presets` | Motion + style catalog (seeded) | `slug` unique, `kind`, `category`, `prompt_fragment`, `model_id`, `params`, `credit_cost` |
| `generations` | Job record **and** artifact record | `status`, `task`, `progress`, `prompt`/`resolved_prompt`, `provider_job_id`, `idempotency_key` unique, `visibility`, `parent_id` (remix lineage) |
| `assets` | Output media, 1:N from generations | `kind`, `url`, `storage_path`, dimensions, `duration_ms` |
| `credit_ledger` | Append-only money trail | `delta`, `reason`, `balance_after`, unique `(generation_id, reason)` |
| `likes` | Explore engagement | PK `(user_id, generation_id)` |

### Integrity rules pushed into the database, not the app

- **`spend_credits()` / `refund_credits()` are `SECURITY DEFINER`** — they lock the profile row
  (`SELECT … FOR UPDATE`), write the ledger, and update the balance atomically. The app cannot debit
  credits any other way.
- **`unique (generation_id, reason)` on `credit_ledger`** makes a retried refund a no-op instead of a
  double credit.
- **`unique (idempotency_key)` on `generations`** makes a double-clicked Generate button a no-op.
- **`check (visibility = 'private' or status = 'succeeded')`** — a failed job can never be published.
- **RLS everywhere**: a user reads only their own rows, plus public succeeded generations. Every write
  path that touches money goes through the service-role client or a SQL function.
- **`handle_new_user()`** trigger creates the profile, the 200-credit grant ledger row, and the default
  project in one transaction on signup.

---

## 5. AI provider layer

```ts
export interface AIProvider {
  readonly name: ProviderName
  submit(req: GenerationRequest): Promise<{ providerJobId: string }>
  poll(jobId: string): Promise<ProviderPollResult>
  cancel?(jobId: string): Promise<void>
}
```

`resolveProvider()` reads `AI_PROVIDER` and **falls back to `mock` whenever the matching key is missing**,
so a fresh clone with no keys runs the entire product. Presets and the UI reference models through
`lib/ai/registry.ts` by registry id — never a raw provider path — so adding fal later is a registry edit
plus one driver file, with no changes to presets, services, or the database.

The mock driver is deterministic: completion is derived from elapsed time since `started_at`, so the
ticker, the sweeper, and a page refresh always agree. It reports smooth progress, returns bundled sample
media, and fails ~1 in 12 submissions on purpose so the refund path is demonstrable.

Guardrails: debit before submit · idempotent refund on failure/timeout · max 2 concurrent jobs per user ·
6-minute timeout · media copied into our own bucket (provider URLs expire) · keys server-only.

---

## 6. Environment variables

`.env.example` is committed; `.env.local` is git-ignored and filled in by the operator.

| Variable | Scope | Required | Source / purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | **yes** | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | **yes** | Same page. Safe to expose; RLS is the guard |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | **yes** | Same page. Bypasses RLS — never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | public | yes | `http://localhost:3000` in dev, the Vercel URL in prod. Used for OAuth redirects and OG tags |
| `AI_PROVIDER` | server | yes | `mock` \| `fal` \| `replicate`. Defaults to `mock` |
| `FAL_KEY` | server | no | Only when `AI_PROVIDER=fal` |
| `REPLICATE_API_TOKEN` | server | no | Only when `AI_PROVIDER=replicate` |
| `CRON_SECRET` | server | no | Shared secret for `/api/cron/sweep`; Vercel sets it automatically on Pro |

Console steps that cannot be scripted: create the Supabase project, copy the three keys, enable the
Google provider under Authentication → Providers (optional — email/password works alone), and add the
Vercel URL to Authentication → URL Configuration at deploy time.

---

## 7. Implementation order

| Phase | Hours | Deliverable | Verification |
|---|---|---|---|
| **0 · Foundation** | 0–4 | Project structure, deps, Tailwind v4 theme, `cn()` + UI primitives, Supabase clients (user/server/admin), middleware, migrations 0001–0005, `.env.example`, types, site config | `npm run typecheck` clean; migrations apply; landing route renders |
| **1 · Auth + shell** | 4–7 | Sign-in/up/forgot pages, Server Actions, OAuth callback, route protection, studio layout (sidebar, topbar, credit pill), dashboard skeleton | Register → profile + 200-credit ledger row + default project exist; protected routes redirect |
| **2 · Generation core** | 7–13 | AI port + registry + mock driver, `generation.service`, `credits.service`, `asset.service`, create/sync routes, upload route, composer UI, Realtime feed, job cards | Text→image and image→video both succeed, fail, and refund; cards update live |
| **3 · Presets + model selector** | 13–16 | `data/presets.json` (24 motion + 12 style), seed script, preset picker, model selector UI, preset gallery, params merge | Preset choice visibly changes the resolved prompt and cost |
| **4 · Projects, library, history** | 16–19 | Project CRUD, project detail, library grid + detail drawer + download/delete, history table, credits ledger view | Generations are filed into projects; assets manageable end to end |
| **5 · Landing + explore + polish** | 19–22 | Premium landing page, explore feed, likes, remix, Framer Motion passes, skeletons, empty/error states, mobile layout, OG tags | Looks like a product at 390px and 1920px; remix round-trips |
| **6 · Harden + deploy** | 22–24 | Rate limits, sweeper, Vitest on credits/registry, demo seed data, README, Vercel deploy + Supabase URL config | Deployed URL passes the definition-of-done walkthrough twice |

Fallback if time compresses: Phases 0–3 alone are a complete, demoable product. Phase 4 can drop to
library-only, and Phase 5's explore feed is the first thing cut.

### Risks

| Risk | Mitigation |
|---|---|
| Supabase keys unavailable at kickoff | Phases 0–2 are written against the schema, not a live DB; the app boots with placeholder env and shows a clear "configure Supabase" state rather than crashing |
| Vercel Hobby cron is daily-only | Client ticker + opportunistic sweep carry the demo; cron is a backstop |
| RLS mistakes silently return empty lists | Every service read is exercised by a page in the same phase it is written; service-role is used only where a comment explains why |
| Mock media looks fake in the demo | Bundled loops are real cinematic clips; swapping in fal later needs only a key |
| Scope creep | §2's out-of-scope list is binding; stretch items only after Phase 6 |
