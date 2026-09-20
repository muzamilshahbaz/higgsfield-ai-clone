import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/supabase/server'
import { createGenerationSchema, fieldErrors } from '@/lib/validation/generation'
import { createGeneration, listMyGenerations } from '@/services/generation.service'
import type { GenerationStatus, GenerationTask } from '@/types/database'

/**
 * POST /api/generations — start a job.
 * GET  /api/generations — the signed-in user's recent jobs.
 *
 * The composer is the only caller. It owns the idempotency key, so a
 * double-clicked Generate button resolves to the same row here instead of a
 * second charge.
 */

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Expected a JSON body.' } },
      { status: 400 },
    )
  }

  const parsed = createGenerationSchema.safeParse(body)
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error)
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: Object.values(fields)[0] ?? 'Check the form and try again.',
          fields,
        },
      },
      { status: 400 },
    )
  }

  const result = await createGeneration(parsed.data)

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: result.message,
          ...(result.code === 'INSUFFICIENT_CREDITS'
            ? { required: result.required, balance: result.balance }
            : {}),
        },
      },
      { status: result.status },
    )
  }

  return NextResponse.json(
    { generation: result.generation, deduped: result.deduped, balance: result.balance },
    { status: result.deduped ? 200 : 201 },
  )
}

const STATUSES: GenerationStatus[] = ['queued', 'running', 'succeeded', 'failed', 'canceled']
const TASKS: GenerationTask[] = ['text_to_image', 'text_to_video', 'image_to_video']

/** Reads a repeatable, optionally comma-joined query param into known values. */
function enumParam<T extends string>(url: URL, key: string, allowed: T[]): T[] {
  return url.searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is T => allowed.includes(value as T))
}

export async function GET(request: Request) {
  // An empty list and "you are signed out" are different answers, and a caller
  // that cannot tell them apart will render "nothing here yet" at someone whose
  // session just expired.
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'You need to be signed in.' } },
      { status: 401 },
    )
  }

  const url = new URL(request.url)

  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 60) : 24

  const offsetParam = Number(url.searchParams.get('offset'))
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0

  const generations = await listMyGenerations({
    limit,
    offset,
    projectId: url.searchParams.get('projectId'),
    status: enumParam(url, 'status', STATUSES),
    task: enumParam(url, 'task', TASKS),
    search: url.searchParams.get('q'),
  })

  // `hasMore` is derived from the page being full rather than from a second
  // count query: one extra round trip per scroll is not worth knowing the
  // exact total on a surface that only ever asks for the next window.
  return NextResponse.json({ generations, hasMore: generations.length === limit })
}
