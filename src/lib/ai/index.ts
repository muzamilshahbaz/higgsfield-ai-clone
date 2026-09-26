export * from '@/lib/ai/types'
export * from '@/lib/ai/registry'
export * from '@/lib/ai/catalogue'
export * from '@/lib/ai/dimensions'

/**
 * The AI barrel.
 *
 * Types, the model registry, the provider catalogue and the size helpers —
 * everything that is data or pure function, and therefore safe in a client
 * bundle.
 *
 * There is deliberately no "pick the active provider" export here any more.
 * That question is per job, not per deployment: it depends on the model the
 * user chose and the keys that user connected, and it is answered in exactly
 * one place, services/ai/ai-router.ts, which is server-only because it touches
 * credentials. An AI_PROVIDER-style build-wide default used to live here and
 * was a second, quieter answer to the same question.
 */
