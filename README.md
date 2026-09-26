# Kinetic Studio

A cinematic AI creative studio — camera-move and film-style presets wrapped around
image and video generation models, with a live job feed, projects, an asset library,
a credits system, and a public feed you can publish to, like and remix from.

Built as a 24-hour MVP sprint. Inspired by the interaction model of preset-driven AI
video tools; not affiliated with any commercial service, and it ships none of their
assets or branding.

[![Kinetic Studio — the landing page, with the model showcase and the signup call to action](docs/assets/landing.png)](https://kineticstudioai.vercel.app)

**Live demo — [kineticstudioai.vercel.app](https://kineticstudioai.vercel.app)** — the
screenshot above links to it.

Signing up grants 200 credits, no card. Generations are real: images and video both
run on open-weight models — FLUX.1, SDXL, Wan 2.2, LTX-Video, CogVideoX,
HunyuanVideo — through Hugging Face, fal.ai or Replicate.

Connect your own key under **Settings → AI model keys** and jobs run on your quota.
**There is no stand-in driver.** With no key available a job is refused, before a
credit is debited, with a sentence naming what to connect — a generation that did not
happen must never look like one that did. A free Hugging Face token is enough for
FLUX.1 [schnell]; everything else needs a fal.ai or Replicate key.

See [`docs/PROVIDERS.md`](docs/PROVIDERS.md) for which provider serves which model,
the request shape each one takes, and every error code a job can carry.

> Full product analysis, architecture, schema and roadmap: [`docs/PLAN.md`](docs/PLAN.md)
> — written before the sprint and kept as the original plan, so it describes the
> mock-first architecture this has since replaced.

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict |
| UI | Tailwind CSS v4, shadcn/ui, Radix, Framer Motion, Lucide, Sonner |
| Database | Supabase Postgres, SQL migrations, RLS on every table |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage (`uploads`, `generations`) |
| Realtime | Supabase Realtime — live job feed, no polling loop |
| AI | Hugging Face · fal.ai · Replicate, behind one provider abstraction |
| Deploy | Vercel |

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API** — copy the project URL, the `anon` key and the
   `service_role` key.
3. **Authentication → Providers** — Email is on by default. Enable Google if you want
   OAuth (optional; email/password works alone).

### 3. Configure the environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `AI_KEY_ENCRYPTION_SECRET` (any high-entropy string —
`openssl rand -base64 48`). That last one seals the provider keys users connect, and
without it nobody can connect an account, which means nobody can generate.

Provider keys themselves are optional here: each user adds their own under
**Settings → AI model keys**. Set `HUGGINGFACE_API_KEY`, `FAL_KEY` or
`REPLICATE_API_TOKEN` only if you want a shared fallback for users who have not.

The service-role key bypasses row level security. It is server-only: never prefix it
with `NEXT_PUBLIC_`, never import it into a client component, never commit it.

### 4. Apply the database migrations

Either run them with the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the Supabase SQL editor, in order:

| File | What it does |
|---|---|
| `0001_schema.sql` | Enums, tables, indexes, `updated_at` triggers |
| `0002_functions.sql` | Signup bootstrap, `spend_credits`, `refund_credits`, `toggle_like` |
| `0003_rls.sql` | Row level security policies |
| `0004_storage.sql` | Storage buckets and object policies |
| `0005_realtime.sql` | Publishes `generations` to Realtime |
| `0006_hardening.sql` | Restricts `toggle_like` to published work; adds the Explore sort index |
| `0007_provider_keys.sql` | The bring-your-own-key vault behind **Settings → AI model keys** |
| `0008_subscriptions.sql` | Plans, subscriptions and the transaction ledger |
| `0009_billing_country.sql` | Billing country on the subscription |
| `0010_huggingface_provider.sql` | Adds `huggingface` to the `provider_name` enum |
| `0011_media_assets.sql` | `media_assets` — reference imagery for the marketing page and preset grid |

### 5. Seed the catalogue

```bash
npm run seed        # presets
npm run seed:media  # reference imagery for the marketing page
```

`seed:media` fills `media_assets` with photographs — landscape, people, animals,
urban — which the landing page reads at render time. Nothing illustrative is bundled
in the repo, so skipping it leaves the marketing sections without images; they degrade
rather than break.

It also repoints any preset still holding a bundled `/samples/` path, which only
matters for a database seeded before those were removed. A fresh `npm run seed` writes
real preview urls straight from `data/presets.json`.

### 6. Run it

```bash
npm run dev
```

### 7. Optional: demo content

Explore is empty until somebody publishes something. After signing up:

```bash
npm run seed:demo -- --email you@example.com
```

Six finished, published shots attributed to that account. They cost zero
credits and write no ledger rows, so the balance still reconciles.

## Deploying

[`DEPLOYMENT.md`](DEPLOYMENT.md) is the checklist: the Supabase console steps
that cannot be scripted, the Vercel environment variables, and the
walkthrough that counts as acceptance.

Two health checks worth knowing:

- `GET /api/health` — 200 when Supabase is configured, reachable and seeded;
  503 naming the failing check otherwise. Booleans only, no values.
- `GET /robots.txt`, `GET /sitemap.xml` — the public surface, with every
  signed-in route disallowed.

## Known limitations

Stated rather than discovered later:

- **No keys means no generation.** There is no demo mode. A fresh deployment with no
  provider key anywhere is fully browsable and cannot generate a thing — the trade
  made when the mock driver was removed.
- **Vercel Hobby caps cron at once a day**, so `/api/cron/sweep` is a backstop, not a
  heartbeat. A video job advances while a tab is open or on the next page load; close
  the tab mid-job and it waits. On Pro, set the schedule in `vercel.json` to
  `* * * * *`. Images are unaffected — they finish inside the request.
- **Hugging Face serves FLUX.1 [schnell] only.** Not a choice: HF stopped hosting
  these models and now routes to partners, and the partners serving FLUX.1 [dev] and
  SDXL through it do not expose the API its driver speaks. Those models go straight to
  fal.ai or Replicate. Documented in [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- **Eight vendors are "Verify only."** Flux (BFL), Stability, OpenAI, Google, Kling,
  Runway, Luma and Pika have live key verification and no generation driver, so no
  model routes to them. Their settings row says so.
- **Credit prices are estimates.** `indicativeUsd` in the registry has not been
  reconciled against provider invoices. Check real jobs before charging money.
- **`media_assets` is not registered in the `Database` type map.** Adding an eleventh
  table tips supabase-js's type machinery past an instantiation limit and the whole
  client generic degrades to `never`, breaking every other table. `media.service.ts`
  reads that one table through a narrowed client instead — two lines, commented.
- **The landing page testimonials are written copy**, attributed to roles rather than
  invented people and labelled as samples on the page. Swap them for real quotes and
  drop the badge.

## Architecture rules

The conventions that keep the codebase coherent. Several of them exist because
something went wrong first — those say what.

1. **`src/app` never queries the database directly.** Routes and Server Actions call a
   service in `src/services`; services are the only layer that touches Supabase.
2. **Credits move only through SQL functions.** `spend_credits` and `refund_credits`
   are `SECURITY DEFINER`, lock the profile row, and write the ledger atomically.
   Refunds are idempotent by unique index, so a retry cannot double-credit.
3. **Providers are plugged in, never hard-coded, and routing is per job.** A model in
   `src/lib/ai/registry.ts` lists the providers that can serve it, in preference
   order; `services/ai/ai-router.ts` walks that list and picks the first one *this
   caller* has a key for. So one model id runs on Hugging Face for a user who
   connected a Hugging Face token and on Replicate for the user beside them, with one
   registry entry and no branch in the composer. Adding a provider is a driver file,
   a catalogue entry, an enum value and a route — no component, preset or service
   changes.
4. **Nothing illustrative is bundled.** Reference imagery lives in `media_assets` and
   is read from the database; preset previews are database columns. There is no
   `public/samples`, no curated array in a component, and no render-time override —
   content that needs a code change and a deploy to edit is not content. Every
   surface that shows it says it is reference photography, not output.
5. **A synchronous provider's job id and its terminal status are written in one
   statement.** Hugging Face has no queue, so `submit` returns a finished job. Marking
   the row `running` first and settling it second opened a three-second window the
   client ticker landed in: `syncMyJobs` polls anything queued or running that carries
   a job id, a synchronous driver has no job left to poll, so it failed and refunded a
   generation that had in fact succeeded — a finished 1MB image under a card reading
   "Failed". Pinned by `tests/synchronous-generation.test.ts`, which asserts the
   *sequence of writes*, because a returned row saying "succeeded" is exactly what the
   broken version produced.
6. **A public page must not stream before it can 404.** `app/g/[id]` has no
   `loading.tsx` on purpose: a Suspense boundary lets Next flush the shell — and a
   200 — before the page decides to call `notFound()`, which turns every dead
   permalink into a soft 404 that crawlers read as a live page.
7. **Rate limits never guard money.** `src/lib/rate-limit.ts` is in-memory and
   per-instance — a brake on runaway clients, not a guarantee. Anything that
   must hold (credit spend, two concurrent jobs, storage scoping) is enforced
   in Postgres and RLS, where a cold start cannot forget it.
8. **Soft deletes go through the service-role client.** The `*_select_own` policies in
   `0003_rls.sql` all require `deleted_at is null`, and PostgREST wraps every UPDATE in
   a RETURNING clause — so Postgres checks those SELECT policies against the *new* row
   and rejects the statement the moment `deleted_at` is set. Deleting a project or a
   generation therefore uses the admin client with an explicit `user_id` filter, which
   is doing the scoping a policy would otherwise do.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run test` | Vitest — 411 offline tests: provider drivers, routing, credits, schemas, registry |
| `npm run seed` | Seed the preset catalogue |
| `npm run seed:media` | Seed `media_assets` and repoint preset previews at it |
| `npm run seed:demo` | Publish sample shots for one account (`-- --email you@…`) |
| `npm run db:push` | Apply migrations via the Supabase CLI |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live schema |
