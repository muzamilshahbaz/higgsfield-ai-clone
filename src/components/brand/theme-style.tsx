import type { SiteSettings } from '@/lib/cms/settings'
import { DEFAULT_SETTINGS } from '@/lib/cms/settings'

/**
 * The runtime theme override.
 *
 * globals.css declares the design tokens in an `@theme` block, which Tailwind compiles to
 * custom properties on `:root`. This emits a second, later `:root` rule with the operator's
 * values, so the cascade does the work: an unchanged token keeps the compiled value and a
 * changed one is overridden. No build step, no class swapping, and no flash — the style tag is
 * in the server-rendered HTML, so the first paint already has the right colours.
 *
 * Only the tokens an operator can edit are emitted, and only when they differ from the
 * shipped value. A `<style>` block repeating fifty identical declarations on every page is
 * bytes for nothing.
 *
 * ## Why this is safe to interpolate
 *
 * These strings end up inside a stylesheet, which is the one place in this application where a
 * stored value could change the meaning of the document rather than its content: a value
 * containing `;` or `}` would close the rule and open another.
 *
 * Two things stop that. The action validates on write against a narrow allow-list —
 * `oklch()`, `rgb()`, `hsl()`, a hex triple or a CSS keyword, nothing nested, no `url()` and
 * no `var()`. And `safeToken` below re-checks on read, because a value could have been written
 * before that validation existed or by something other than the form. Anything that fails is
 * dropped in favour of the compiled default rather than escaped — a colour is either a colour
 * or it is a mistake, and there is no useful third outcome.
 */

/**
 * A value that may be interpolated into a stylesheet.
 *
 * Deliberately stricter than "no semicolons". It is an allow-list of the shapes a colour or a
 * length legitimately takes, so the question is never "did I think of every dangerous
 * character" — it is "is this one of the four things a token is allowed to be".
 */
const SAFE_VALUE = /^(#[0-9a-f]{3,8}|(oklch|rgb|rgba|hsl|hsla)\([0-9a-z.,%/\s+-]*\)|[a-z]{3,20}|[0-9.]+(rem|px|em))$/i

function safeToken(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback
  const trimmed = value.trim()
  if (trimmed.length > 64) return fallback
  return SAFE_VALUE.test(trimmed) ? trimmed : fallback
}

/**
 * A font family name, quoted.
 *
 * Only the two faces the app actually loads are accepted. A font name with no `@font-face`
 * behind it silently falls through to the system stack, so offering arbitrary names would be
 * offering a setting that appears to do nothing.
 */
const BUNDLED_FONTS: Record<string, string> = {
  Inter: 'var(--font-inter)',
  'Space Grotesk': 'var(--font-space-grotesk)',
}

export function ThemeStyle({ settings }: { settings: SiteSettings }) {
  const defaults = DEFAULT_SETTINGS.theme
  const theme = settings.theme

  const declarations: string[] = []

  const push = (property: string, value: string, fallback: string) => {
    const safe = safeToken(value, fallback)
    // Only what differs. An identical declaration repeated on every page is bytes for nothing.
    if (safe !== fallback) declarations.push(`${property}:${safe}`)
  }

  push('--color-primary', theme.colorPrimary, defaults.colorPrimary)
  push('--color-ring', theme.colorPrimary, defaults.colorPrimary)
  push('--color-accent', theme.colorAccent, defaults.colorAccent)
  push('--color-background', theme.colorBackground, defaults.colorBackground)
  push('--color-credit', theme.colorCredit, defaults.colorCredit)
  push('--radius-lg', theme.radius, defaults.radius)

  /*
   * Surface drives four tokens, not one.
   *
   * `--color-surface`, `--color-card` and `--color-popover` are the same value in the shipped
   * ramp, and an operator who changes "Surface" means all three — a panel and a card rendering
   * different greys is not a theme, it is a bug. `--color-surface-2` is the step above it and
   * is left alone, because deriving a lighter shade from an arbitrary colour string is not
   * something CSS can do without `color-mix()` and a guess about the colour space.
   */
  const surface = safeToken(theme.colorSurface, defaults.colorSurface)
  if (surface !== defaults.colorSurface) {
    declarations.push(`--color-surface:${surface}`)
    declarations.push(`--color-card:${surface}`)
    declarations.push(`--color-popover:${surface}`)
  }

  const sans = BUNDLED_FONTS[theme.fontSans]
  if (sans && theme.fontSans !== defaults.fontSans) {
    declarations.push(`--font-sans:${sans},ui-sans-serif,system-ui,sans-serif`)
  }

  const display = BUNDLED_FONTS[theme.fontDisplay]
  if (display && theme.fontDisplay !== defaults.fontDisplay) {
    declarations.push(`--font-display:${display},ui-sans-serif,system-ui,sans-serif`)
  }

  const rules: string[] = []
  if (declarations.length > 0) rules.push(`:root{${declarations.join(';')}}`)

  /*
   * Animations off.
   *
   * The same mechanism the `prefers-reduced-motion` block in globals.css uses, applied on
   * purpose rather than by preference. `!important` is warranted here: it has to beat
   * per-element inline durations, and it is switching something off rather than styling it.
   *
   * A visitor who has asked for reduced motion already gets this regardless of the setting;
   * this is for an operator who wants a still interface for everybody.
   */
  if (!theme.animations) {
    rules.push(
      '*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}',
    )
  }

  if (rules.length === 0) return null

  // Inline rather than a stylesheet link: it is a few hundred bytes, it must not arrive after
  // the first paint, and a separate request for it would be a render-blocking round trip.
  return <style dangerouslySetInnerHTML={{ __html: rules.join('') }} />
}
