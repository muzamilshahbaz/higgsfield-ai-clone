import { ASPECT_RATIOS } from '@/lib/constants'

/**
 * Aspect ratio -> pixel dimensions.
 *
 * Hugging Face's image endpoints take `width` and `height` and nothing else,
 * so somebody has to turn "16:9" into numbers. Doing it here rather than in
 * each driver means fal and Replicate quote the same shot the same way, and a
 * ratio the registry advertises can never produce a size a diffusion model
 * will refuse.
 *
 * Multiples of 32 because every UNet and VAE in the catalogue downsamples by
 * powers of two; an odd width is the classic source of a one-pixel seam or an
 * outright shape error deep in the model.
 */

const DEFAULT_RATIO = 16 / 9

/** Roughly one megapixel: what FLUX and SDXL are trained near. */
const DEFAULT_TARGET_PIXELS = 1024 * 1024

export function ratioValue(aspectRatio: string): number {
  return ASPECT_RATIOS.find((entry) => entry.value === aspectRatio)?.ratio ?? DEFAULT_RATIO
}

function snap(value: number): number {
  return Math.max(256, Math.min(1536, Math.round(value / 32) * 32))
}

/**
 * The width and height for one shot, area-matched to `targetPixels` so a
 * 21:9 frame costs a model about what a square one does.
 */
export function dimensionsFor(
  aspectRatio: string,
  targetPixels = DEFAULT_TARGET_PIXELS,
): { width: number; height: number } {
  const ratio = ratioValue(aspectRatio)
  const height = Math.sqrt(targetPixels / ratio)

  return { width: snap(height * ratio), height: snap(height) }
}

/**
 * The closest ratio a provider actually accepts.
 *
 * Replicate's FLUX models take an `aspect_ratio` string from a fixed list
 * rather than dimensions, and passing one they do not know is a 422 after the
 * credit debit. So an unsupported ratio degrades to the nearest supported one
 * instead of failing the job.
 */
export function nearestSupportedRatio(aspectRatio: string, supported: string[]): string {
  if (supported.includes(aspectRatio)) return aspectRatio

  const wanted = ratioValue(aspectRatio)
  let best = supported[0] ?? '16:9'
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of supported) {
    const distance = Math.abs(Math.log(ratioValue(candidate) / wanted))
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }

  return best
}
