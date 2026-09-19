# Kinetic Studio

A cinematic AI creative studio — camera-move and film-style presets wrapped around
image and video generation models, with a live job feed, projects, an asset library
and a credits system.

Built as a 24-hour MVP sprint. Inspired by the interaction model of preset-driven AI
video tools; not affiliated with any commercial service, and it ships none of their
assets or branding.

> Full product analysis, architecture, schema and roadmap: [`docs/PLAN.md`](docs/PLAN.md)

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict |
| UI | Tailwind CSS v4, shadcn/ui, Radix, Framer Motion, Lucide, Sonner |
| Database | Supabase Postgres, SQL migrations, RLS on every table |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage (`uploads`, `generations`) |
| Realtime | Supabase Realtime — live job feed, no polling loop |
| AI | Provider abstraction: `mock` (default), `fal`, `replicate` |
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

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Leave `AI_PROVIDER=mock` — the app runs end to end
with no model keys and no spend.

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

### 5. Seed the preset catalog

```bash
npm run seed
```

### 6. Run it

```bash
npm run dev
```

## Architecture rules

Three conventions keep the codebase coherent:

1. **`src/app` never queries the database directly.** Routes and Server Actions call a
   service in `src/services`; services are the only layer that touches Supabase.
2. **Credits move only through SQL functions.** `spend_credits` and `refund_credits`
   are `SECURITY DEFINER`, lock the profile row, and write the ledger atomically.
   Refunds are idempotent by unique index, so a retry cannot double-credit.
3. **Providers are plugged in, never hard-coded.** Presets reference a model by
   registry id in `src/lib/ai/registry.ts`. Adding a real provider is one driver file
   plus a key — no changes to presets, services or the schema.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run test` | Vitest (credits math, provider adapter, registry) |
| `npm run seed` | Seed presets and demo data |
| `npm run db:push` | Apply migrations via the Supabase CLI |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live schema |
