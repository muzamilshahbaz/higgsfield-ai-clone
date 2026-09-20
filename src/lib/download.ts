/**
 * Saving a generation to disk.
 *
 * A plain `<a download>` is ignored for cross-origin URLs, and everything in
 * the `generations` bucket is cross-origin, so the file is fetched into a blob
 * first and saved from an object URL. When that is refused — an offline tab, a
 * CORS policy we do not control — the tab falls back to opening the media,
 * which is worse than a download but far better than a dead button.
 */

export function filenameFor(url: string, prompt: string, fallbackExtension = 'png'): string {
  const path = url.split('?')[0] ?? url
  const extension = path.split('.').pop()?.toLowerCase()
  const safeExtension =
    extension && extension.length <= 4 && /^[a-z0-9]+$/.test(extension)
      ? extension
      : fallbackExtension

  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'kinetic-shot'

  return `${slug}.${safeExtension}`
}

export async function downloadMedia(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`fetch returned ${response.status}`)

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()

    // Revoked on the next frame rather than immediately: Safari cancels a
    // download whose object URL is released in the same tick as the click.
    requestAnimationFrame(() => URL.revokeObjectURL(objectUrl))
    return true
  } catch (cause) {
    console.error('[download] falling back to opening the file:', cause)
    window.open(url, '_blank', 'noopener,noreferrer')
    return false
  }
}
