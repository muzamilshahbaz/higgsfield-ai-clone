# Deploying Kinetic

Everything here is a step someone with access to the accounts has to take.
Nothing in this file can be scripted from the repository, which is why it is a
checklist rather than a command.

Work top to bottom. The walkthrough at the end is the acceptance test.

---

## 1. Supabase — before the first deploy

- [ ] **Apply the migrations.** `supabase/migrations/0001` → `0010`, in order,
      either with `npx supabase db push` against a linked project or by pasting
      each file into the SQL editor.

      `0006_hardening.sql` is new in Phase 6 and has not been applied to the
      existing project. Until it is, `toggle_like()` will accept a private
      generation's id — see [Known gaps](#known-gaps).

- [ ] **Seed the catalogue.** `npm run seed`. Without it the composer opens
      with no presets and `/api/health` reports `presetsSeeded: false`.

- [ ] **Turn off "Confirm email"** under Authentication → Providers → Email,
      or accept that signup ends on a "check your inbox" screen rather than the
      dashboard. `supabase/config.toml` governs only the local CLI stack; the
      hosted project has its own setting and defaults it on.

- [ ] **Optional: enable Google** under Authentication → Providers.
      Email and password work alone.

## 2. Vercel — project setup

- [ ] Import the repository. The defaults are correct: Next.js, `npm run build`.

- [ ] **Environment variables** (Project Settings → Environment Variables).
      Set these for Production *and* Preview:

      | Variable | Value |
      |---|---|
      | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
      | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
      | `SUPABASE_SERVICE_ROLE_KEY` | same page — **server only, never `NEXT_PUBLIC_`** |
      | `NEXT_PUBLIC_SITE_URL` | the deployment's own URL, no trailing slash |
      | `AI_KEY_ENCRYPTION_SECRET` | `openssl rand -base64 48` — **required for generation** |
      | `CRON_SECRET` | any long random string |

      `AI_KEY_ENCRYPTION_SECRET` seals the provider keys users connect. Without
      it the AI model keys tab is read-only, nobody can connect an account, and
      therefore nobody can generate. Changing it does **not** re-encrypt what is
      already stored: every existing key stops opening and users have to
      reconnect, so treat it like a database password.

      `HUGGINGFACE_API_KEY`, `FAL_KEY` and `REPLICATE_API_TOKEN` are optional
      shared fallbacks, used only for users who have not connected their own. A
      job with no user key and no shared key is refused with a message naming
      what to connect — it is never faked. See
      [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

- [ ] **Set them before the first build, and redeploy after any change.**
      The three `NEXT_PUBLIC_*` values are substituted into the browser bundle
      as literal text when `next build` runs, not read at request time. Saving
      a corrected value in the dashboard does nothing to the bundle that is
      already live — it takes a new deployment. A build with them missing
      still *succeeds*, which is the trap: the failure surfaces later as a
      signed-out app that cannot reach Supabase, not as a red build.

- [ ] **Deploy.**

## 3. Supabase — after the URL exists

- [ ] **Authentication → URL Configuration.** Set the Site URL to the Vercel
      URL and add `https://<your-domain>/auth/callback` to the redirect
      allow-list. Password reset and OAuth both fail without this, and they
      fail *silently* — the link just lands on the wrong origin.

- [ ] Re-check `NEXT_PUBLIC_SITE_URL` matches the real URL. It is what OG tags
      and email links are built from.

## 4. Verify the deployment

- [ ] `GET /api/health` returns `200` and `{"ok": true}` with all four checks
      true. A `503` names which one failed.

- [ ] `GET /robots.txt` and `GET /sitemap.xml` both return content.

- [ ] Optional: `npm run seed:demo -- --email you@example.com` after signing
      up, so Explore is not empty for the first visitor. Demo rows cost zero
      credits and write no ledger entries.

## 5. The walkthrough

This is the definition of done from `docs/PLAN.md` §2. Run it twice — once
signed out, once as a second account.

1. Open the landing page. Sign up.
2. Land on the dashboard with **200 credits**.
3. Open Create, pick a preset, write a prompt, Generate.
4. Watch the card move queued → generating → ready without a reload.
5. Open it in the library. Download it. Publish it.
6. Open Explore. The shot is there. Like it.
7. Copy its link. Open that link in a private window — it renders signed out.
8. From a second account, hit Remix. The composer opens configured.
9. Generate the remix. The original shows "1 remix".
10. Check Settings: the ledger sums to the balance shown in the header.

No console errors at any step.

---

## Known gaps

- **`0006_hardening.sql` is unapplied on the existing project.** Until it is,
  a signed-in user who knows a private generation's UUID can move its
  `like_count`. Nothing is disclosed and no money moves.
- **Rate limits are per-instance.** `src/lib/rate-limit.ts` keeps counters in
  memory, so the real ceiling scales with the number of running instances and
  resets on a cold start. Spend limits and RLS are not affected — those live in
  Postgres. Swap in Vercel KV or Upstash by replacing `rateLimit`.
- **Vercel Hobby caps cron at once a day**, so `/api/cron/sweep` is a backstop,
  not a heartbeat. The client ticker and the page-load sweep are what actually
  advance jobs. On Pro, change the schedule in `vercel.json` to `* * * * *`.
- **Generation needs a key, from somebody.** Three providers ship real drivers
  — Hugging Face, fal.ai and Replicate — and a job runs on the user's own key
  first, then the deployment's shared one. With neither, the job is refused
  before it is charged. That is deliberate: a generation that did not happen
  must not look like one that did. There is no stand-in driver — the mock
  provider and its bundled sample media were removed — so a deployment with no
  keys anywhere can browse the product but cannot generate.
- **Eight vendors can be verified but not generated with.** Flux (BFL direct),
  Stability, OpenAI, Google, Kling, Runway, Luma and Pika have live
  key-verification probes and no generation driver, so no model routes to them.
  Their row in the settings tab is labelled **Verify only**. Adding one is a
  `createDriver` on its module plus a `route` on each model — the five steps at
  the end of [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- **Hugging Face generates on the request itself.** It has no queue, so
  `/api/generations` sets `maxDuration = 60`: a cold model can take most of a
  minute to load its weights. If the platform kills the function first, the
  sweeper fails and refunds the job fifteen seconds later. fal.ai and Replicate
  return a handle immediately and never need the headroom.
