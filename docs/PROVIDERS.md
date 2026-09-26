# Providers and models

Every generation in this app runs on a real provider account. There is no
placeholder path: with no usable key, a job is refused before it is charged,
with a message naming what to connect.

This file records which providers are wired up, which open-weight model sits
behind each id in the composer, and where a choice had to be made.

## The three providers

Tried in this order, per job, by `services/ai/ai-router.ts`:

| Order | Provider | Serves | Why here |
| --- | --- | --- | --- |
| 1 | **Hugging Face** | FLUX.1 [schnell] only | A free token is the shortest path from a new account to a real generation. It serves one model here — see *What Hugging Face actually is now*. |
| 2 | **fal.ai** | images + video | The fastest queue of the three, and the one that serves every video model. |
| 3 | **Replicate** | images + video | The broadest catalogue. Last because it is not the cheapest. |

A user's own key (Settings → AI model keys, encrypted with AES-256-GCM) always
wins. Failing that, the deployment's shared key from the environment. Failing
both, the job is refused.

The order is per *model*, not global: a model lists the providers that can serve
it in `routes`, and the router walks that list. So one user runs FLUX.1
[schnell] on Hugging Face and the user beside them runs the same model id on
Replicate, with one registry entry and no branch in the UI.

### What Hugging Face actually is now

Hugging Face no longer runs these models on its own hardware. `hf-inference`
answers **410 — "the requested model is deprecated and no longer supported by
provider hf-inference"** for every image model in this catalogue. What it does
now is *route* to partner providers, each reached at its own path under
`router.huggingface.co`.

Those partners do not share a request shape. Some expose the OpenAI images API
(`/{provider}/v1/images/generations`); fal.ai and Replicate expose their own
native queue shapes and answer *"Application images not found"* on that path. So
the driver asks the Hub which partners serve a model
(`?expand[]=inferenceProviderMapping`), tries the live ones in order, skips any
that decline the shape, and caches the one that worked for an hour. Discovering
it beats hardcoding a partner list: a partner added, dropped or taken down
becomes a fact read at run time rather than a deploy.

Verified live on 2026-09-26 — the mapping for each model:

| Model | Live partners through Hugging Face | Usable here |
| --- | --- | --- |
| FLUX.1 [schnell] | nscale, fal-ai, wavespeed (together: error) | **nscale** ✅ |
| FLUX.1 [dev] | fal-ai, replicate, wavespeed | none ❌ |
| SDXL 1.0 | fal-ai (together: error) | none ❌ |

**That is why only `lumen-flash` carries a Hugging Face route.** The partners
serving FLUX.1 [dev] and SDXL through Hugging Face are fal.ai and Replicate,
which this app already talks to natively — sending those models back through
Hugging Face would be a second implementation of a provider we already have.

### Two request shapes, not one

Hugging Face has **no queue**. One POST goes out and the image comes back on the
same response, so there is no job to poll. That does not fit a submit/poll
driver, so `submit` returns the finished result in `immediate` (see
`SubmitResult` in `lib/ai/types.ts`) and the service applies it through the same
code path a poll result takes — one place that persists media, flips the status
and refunds a failure.

**The invariant that makes that safe:** a synchronous job's id and its terminal
status are written in a *single* statement. Marking the row `running` with the
id first and settling it second opens a window the ticker lands in —
`syncMyJobs` picks up anything queued or running that carries a job id, a
synchronous driver has no job left to poll, and the row gets failed and
refunded. That happened in QA: a finished 1MB image under a card reading
"Failed", credit handed back. Pinned by `tests/synchronous-generation.test.ts`.

fal.ai and Replicate are real queues: submit returns a handle, and the job is
polled by the client ticker, the page-load sweep and the cron backstop.

## Models

Every entry is open-weight. `id` is what presets and the database reference;
changing what sits behind an id is a single edit in `lib/ai/registry.ts`.

### Images

| id | Model | Hugging Face | fal.ai | Replicate |
| --- | --- | --- | --- | --- |
| `lumen-flash` | FLUX.1 [schnell] | `black-forest-labs/FLUX.1-schnell` | `fal-ai/flux/schnell` | `black-forest-labs/flux-schnell` |
| `lumen-pro` | FLUX.1 [dev] | — | `fal-ai/flux/dev` | `black-forest-labs/flux-dev` |
| `lumen-portrait` | FLUX.1 [dev], portrait params | — | `fal-ai/flux/dev` | `black-forest-labs/flux-dev` |
| `lumen-sdxl` | Stable Diffusion XL 1.0 | — | `fal-ai/fast-sdxl` | `stability-ai/sdxl` |

### Video

| id | Model | fal.ai | Replicate |
| --- | --- | --- | --- |
| `motion-turbo` | Wan 2.2 I2V (turbo) | `fal-ai/wan/v2.2-a14b/image-to-video/turbo` | `wan-video/wan-2.2-i2v-fast` |
| `motion-cine` | Wan 2.2 I2V A14B | `fal-ai/wan/v2.2-a14b/image-to-video` | `wan-video/wan-2.2-i2v-a14b` |
| `motion-scene` | Wan 2.2 T2V A14B | `fal-ai/wan/v2.2-a14b/text-to-video` | `wan-video/wan-2.2-t2v-fast` |
| `motion-ltx` | LTX-Video 13B distilled | `fal-ai/ltx-video-13b-distilled` | `lightricks/ltx-video` |
| `motion-cog` | CogVideoX-5B | `fal-ai/cogvideox-5b` | `cuuupid/cogvideox-5b` |
| `motion-hunyuan` | HunyuanVideo | `fal-ai/hunyuan-video` | `tencent/hunyuan-video` |

## Choices worth recording

**No Hugging Face route on any video model.** Hugging Face does route video
models on to partner providers, but under each partner's own request and
response shape rather than one documented contract. A wrong shape there fails
*after* the credit debit, on a user's own quota. Video therefore runs on fal.ai
or Replicate, which both expose a real job queue. If HF's video contract
stabilises, adding a route is one line per model.

**Kling, Runway, Luma, Veo, Imagen, Pika and SD 3.5 are no longer in the
composer.** They are closed-weight, or served only by a direct vendor account,
and the brief is open-source first. They remain in
`lib/ai/catalogue.ts` as vendors a user can connect and verify — their
key-verification probes are live and tested — and their settings row is labelled
**Verify only**, because no model routes to them. Connecting one stores and
checks a key and nothing more, which the UI says in as many words.

**Frame counts, not seconds, on Replicate.** Replicate's video models take
`num_frames`; fal's take `duration` in seconds. A route declares the model's
native frame rate (`videoFrameRate`) and the driver computes
`num_frames = duration × fps + 1` — the diffusers convention, and how a
five-second request becomes Wan's 81 frames or LTX's 121. A route with no
declared rate sends no frame count, because a model whose length is fixed must
not be handed one.

**Sizing differs per Replicate model.** Replicate validates input against each
model's hand-written schema and rejects a key it does not declare: the FLUX
models take an `aspect_ratio` string, SDXL takes `width` and `height`. The route
says which (`sizing`), and an aspect ratio a model does not list degrades to the
nearest one it does rather than becoming a 422 the user paid for. Hugging Face
and fal each have one house style, so their drivers do not need this.

**Replicate versions resolve themselves.** A route names `owner/name`, which
reads well and does not rot on every push. Submit tries the official-model
endpoint first and, on the 404 that means "not an official model", looks up
`latest_version` and posts that instead — cached for an hour. A route can pin a
version as `owner/name:<hash>` when output has to be reproducible.

**Gated repos answer 403 to a valid token.** FLUX.1 [dev] is gated: the account
has to accept its licence at
[huggingface.co/black-forest-labs/FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev)
first. That is `MODEL_GATED`, and its message names the page — the generic 403
says "check your API key", which would send someone to re-paste a working token
forever. It matters less than it did now that no Hugging Face route points at a
gated model, but the mapping can change under us and the error should stay
right when it does.

**Hugging Face sends no seed, negative prompt or guidance.** The OpenAI images
shape has no place for them, and FLUX.1 [schnell] is guidance-distilled so two
of the three would do nothing anyway. `size` *is* honoured to the exact pixel —
verified. A user who needs a pinned seed should run the model on fal.ai or
Replicate, whose native APIs take one.

**Costs are not reported unless the provider reports money.** Replicate bills
compute seconds at a rate that depends on hardware, so the driver records no
`provider_cost_usd` rather than a number the billing page would treat as spend.

## Error codes a job can carry

All of these reach the user as a sentence on the card, and all of them refund.

| Code | Means | Retryable |
| --- | --- | --- |
| `PROVIDER_AUTH` | The key was rejected. | no |
| `PROVIDER_BILLING` | The provider account is out of credit. | no |
| `PROVIDER_RATE_LIMIT` | The key is being rate limited. | yes |
| `MODEL_LOADING` | Hugging Face is loading the weights. | yes |
| `MODEL_GATED` | The Hugging Face repo needs its licence accepted. | no |
| `MODEL_UNAVAILABLE` | The provider no longer serves the model. | no |
| `PROVIDER_REJECTED` | The prompt or settings were refused. | no |
| `PROVIDER_TIMEOUT` | No answer in time. | yes |
| `NO_OUTPUT` | The job finished and returned no media. | yes |
| `STORAGE_FAILED` | Media came back and could not be stored. | yes |
| `PROVIDER_DISCONNECTED` | The key the job was running on is gone, or it ran on the retired mock driver. | no |
| `TIMEOUT` | The job outlived `LIMITS.jobTimeoutMs`. | yes |

## Testing against a live provider

The offline suite (`npm test`) stubs `fetch` and covers request shaping, status
mapping and every failure branch. Two opt-in probes talk to the real vendors:

```bash
# Reaches all eleven vendors with a bogus key. Nothing is enqueued or billed.
LIVE_PROBE=1 npx vitest run tests/provider-probe.live.test.ts
```

```bash
# The whole happy path. This DOES generate and DOES spend from the account.
LIVE_PROBE=1 PROBE_HF_KEY=hf_... npx vitest run tests/provider-probe.live.test.ts
```

## Adding a provider

1. A module in `services/ai/providers/` exporting `verifyKey` and `createDriver`.
2. An entry in `lib/ai/catalogue.ts`.
3. The name in `ProviderName` (`types/database.ts`) and in the `provider_name`
   enum, via a migration.
4. Its env var in `serverProviderKey` (`lib/env.ts`).
5. A `route` on each model it can serve.

Nothing else. No component, no preset and no database row needs editing.
