/**
 * Copies the flag SVGs out of `country-flag-icons` into `public/flags`.
 *
 * Why copy rather than import: the package's React barrel is 331 KB of
 * JavaScript and its `flags.css` is 201 KB of base64, either of which would be
 * a serious regression against a 102 KB shared bundle — to render about ten
 * flags at a time. Each SVG on its own is ~820 bytes, so serving them as
 * static files means the browser fetches only the ones actually on screen and
 * caches them individually.
 *
 * The output is committed. Generating it at build time instead would make a
 * silent script failure look like missing flags on a deploy nobody inspected.
 *
 *   node scripts/sync-flags.mjs
 *
 * Re-run after upgrading country-flag-icons.
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'country-flag-icons', '3x2')
const target = join(root, 'public', 'flags')

let files
try {
  files = readdirSync(source).filter((f) => f.endsWith('.svg'))
} catch {
  console.error('country-flag-icons is not installed. Run `npm install` first.')
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

for (const file of files) {
  // Lowercased so the URL matches the lowercased ISO code the UI builds.
  cpSync(join(source, file), join(target, file.toLowerCase()))
}

console.log(`Copied ${files.length} flags into public/flags`)
