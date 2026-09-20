import { NextResponse } from 'next/server'

import { LIMITS, RATE_LIMITS } from '@/lib/constants'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { fieldErrors, uploadSchema } from '@/lib/validation/generation'
import { uploadStartFrame } from '@/services/asset.service'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * The multipart envelope costs a little more than the file it carries, so the
 * body cap sits above the file cap. A body under this can still be refused by
 * `uploadSchema` on the file's own size — this only catches the requests that
 * never get far enough to be validated properly.
 */
const MAX_UPLOAD_BODY_BYTES = LIMITS.maxUploadBytes + 256 * 1024

const MAX_UPLOAD_MB = Math.round(LIMITS.maxUploadBytes / 1024 / 1024)

function oversizeResponse() {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION',
        message: `Images must be ${MAX_UPLOAD_MB}MB or smaller.`,
        fields: { sizeBytes: `Images must be ${MAX_UPLOAD_MB}MB or smaller.` },
      },
    },
    { status: 413 },
  )
}

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

  // Anything much over the cap never reaches `formData()` — the platform
  // refuses the body first and the parse throws, which used to surface as
  // "Expected a multipart upload." at someone who had simply picked a large
  // photo. Checking the declared length first means the size limit is stated
  // as the size limit, whichever guard actually stops the request.
  const declaredLength = Number(request.headers.get('content-length') ?? '')
  const tooLarge = Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BODY_BYTES

  if (tooLarge) return oversizeResponse()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    // No usable content-length (a chunked upload), so the body itself is the
    // only evidence — and an unparseable one at this size is the cap again.
    if (!Number.isFinite(declaredLength)) return oversizeResponse()

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
            `Use a PNG, JPEG or WebP under ${MAX_UPLOAD_MB}MB.`,
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
