import { NextResponse } from 'next/server'

import { LIMITS, RATE_LIMITS } from '@/lib/constants'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { fieldErrors, uploadSchema } from '@/lib/validation/generation'
import { uploadStartFrame } from '@/services/asset.service'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * POST /api/uploads — store a start frame for image-to-video.
 *
 * Validated here as well as on the bucket: the bucket's mime and size limits
 * are the real enforcement, but a 400 with a sentence the user can act on
 * beats a raw storage error.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'You need to be signed in.' } },
      { status: 401 },
    )
  }

  // Storage writes cost us something per call, so this is limited per user
  // rather than per IP — the account is the thing worth following.
  const limit = rateLimit(clientKey(request, user.id), RATE_LIMITS.uploads)
  if (!limit.ok) {
    return tooManyRequests(
      limit,
      `That is a lot of uploads at once. Try again in ${limit.retryAfterSec}s.`,
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Expected a multipart upload.' } },
      { status: 400 },
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'No file was attached.' } },
      { status: 400 },
    )
  }

  const parsed = uploadSchema.safeParse({
    fileName: file.name || 'upload',
    mimeType: file.type,
    sizeBytes: file.size,
  })

  if (!parsed.success) {
    const fields = fieldErrors(parsed.error)
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            Object.values(fields)[0] ??
            `Use a PNG, JPEG or WebP under ${Math.round(LIMITS.maxUploadBytes / 1024 / 1024)}MB.`,
          fields,
        },
      },
      { status: 400 },
    )
  }

  const result = await uploadStartFrame(file)
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: result.error } },
      { status: 502 },
    )
  }

  return NextResponse.json({ image: result.image }, { status: 201 })
}
