import { AlertTriangle } from 'lucide-react'

import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-chrome'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordForm } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSettingsForAdmin } from '@/services/cms/settings.service'

import { saveTheme } from '../_actions/system'

/**
 * Theme tokens.
 *
 * These values are interpolated into a `<style>` block on every page, which makes this the
 * one screen in the panel where validation is a security control rather than a convenience.
 * A value containing `;` or `}` could close the rule and open another, so the action accepts
 * only a narrow shape: `oklch()`, `rgb()`, `hsl()`, a hex triple, or a bare CSS keyword. No
 * `url()`, no `var()`, no nesting.
 *
 * The preview is the other half of the screen's job. A colour in a text field tells an
 * operator nothing about contrast, and this design system has specific opinions — cyan fills
 * carry dark ink, coral never fills a primary button, credits get their own warm channel. The
 * swatches show all four in the roles they actually occupy.
 */

const FIELDS: FieldSpec[] = [
  {
    kind: 'color',
    name: 'theme.color_primary',
    label: 'Primary',
    half: true,
    help: 'The only colour that means “do this”: buttons, focus rings, progress. It must be light enough to carry dark ink.',
  },
  {
    kind: 'color',
    name: 'theme.color_accent',
    label: 'Accent',
    half: true,
    help: 'The second voice. Marks, counts and annotates — by convention it never fills a primary action.',
  },
  {
    kind: 'color',
    name: 'theme.color_background',
    label: 'Background',
    half: true,
    help: 'The canvas. Graphite rather than black: pure black forces every border to fight for contrast.',
  },
  {
    kind: 'color',
    name: 'theme.color_surface',
    label: 'Surface',
    half: true,
    help: 'Panels and cards, one step up from the canvas.',
  },
  {
    kind: 'color',
    name: 'theme.color_credit',
    label: 'Credit',
    half: true,
    help: 'Credits are money, so they get their own warm channel — never the primary, which would make a balance look like a button.',
  },
  {
    kind: 'text',
    name: 'theme.radius',
    label: 'Corner radius',
    mono: true,
    half: true,
    help: 'A length like 0.625rem. Buttons and cards derive from it.',
  },
  {
    kind: 'select',
    name: 'theme.font_sans',
    label: 'Interface font',
    options: [
      { value: 'Inter', label: 'Inter' },
      { value: 'Space Grotesk', label: 'Space Grotesk' },
    ],
    half: true,
    help: 'Must be one of the two the app bundles — a font name with no file behind it silently falls back to the system stack.',
  },
  {
    kind: 'select',
    name: 'theme.font_display',
    label: 'Display font',
    options: [
      { value: 'Space Grotesk', label: 'Space Grotesk' },
      { value: 'Inter', label: 'Inter' },
    ],
    half: true,
    help: 'Headings only.',
  },
  {
    kind: 'select',
    name: 'theme.mode',
    label: 'Colour mode',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light — not supported' },
    ],
    half: true,
    help: 'This build is designed dark-only. A light theme is not half the work of this one, it is all of it again, and nothing in the product asks for it.',
  },
  {
    kind: 'boolean',
    name: 'theme.animations',
    label: 'Animations',
    help: 'Off disables the reveal transitions and the preset marquee site-wide. Visitors who have set “reduce motion” already get that regardless of this switch.',
  },
]

export default async function AdminThemePage() {
  await requireCapability('settings:write', '/admin/theme')

  const settings = await getSettingsForAdmin()

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="Theme"
        description="Colours, type and motion. Injected into every page as CSS custom properties, so a change is live on the next navigation."
        actions={
          <Button asChild variant="outline">
            <a href="/" target="_blank" rel="noreferrer">
              View the live site
            </a>
          </Button>
        }
      />

      <AdminPanel
        title="Preview"
        description="Each colour in the role it actually occupies, over the canvas you have configured."
      >
        <div
          className="space-y-5 rounded-lg border border-border p-6"
          style={{ background: settings.theme.colorBackground }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium"
              style={{
                background: settings.theme.colorPrimary,
                color: settings.theme.colorBackground,
                borderRadius: settings.theme.radius,
              }}
            >
              Generate
            </span>

            <span
              className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium"
              style={{
                borderColor: settings.theme.colorPrimary,
                color: settings.theme.colorPrimary,
                borderRadius: settings.theme.radius,
              }}
            >
              Secondary
            </span>

            <span
              className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ color: settings.theme.colorAccent, background: 'rgb(255 255 255 / 0.06)' }}
            >
              Remix
            </span>

            <span
              className="text-sm font-medium tabular-nums"
              style={{ color: settings.theme.colorCredit }}
            >
              182 credits
            </span>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{
              background: settings.theme.colorSurface,
              borderColor: 'rgb(255 255 255 / 0.08)',
              borderRadius: settings.theme.radius,
            }}
          >
            <p
              className="text-base font-semibold"
              style={{ color: 'rgb(255 255 255 / 0.97)', fontFamily: settings.theme.fontDisplay }}
            >
              A panel, on the surface colour
            </p>
            <p className="mt-2 text-sm" style={{ color: 'rgb(255 255 255 / 0.65)' }}>
              Body text sits at reduced opacity over the surface. If this is hard to read, the surface
              is too light for the ramp the rest of the interface assumes.
            </p>

            <div className="mt-4 h-1 overflow-hidden rounded-full" style={{ background: 'rgb(255 255 255 / 0.1)' }}>
              <div className="h-full w-2/3 rounded-full" style={{ background: settings.theme.colorPrimary }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['Primary', settings.theme.colorPrimary],
                ['Accent', settings.theme.colorAccent],
                ['Surface', settings.theme.colorSurface],
                ['Credit', settings.theme.colorCredit],
                ['Background', settings.theme.colorBackground],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="size-7 rounded-md border"
                  style={{ background: value, borderColor: 'rgb(255 255 255 / 0.15)' }}
                  aria-hidden
                />
                <span className="text-[11px]" style={{ color: 'rgb(255 255 255 / 0.6)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Tokens"
        description="Paste a value straight out of the stylesheet, or a hex triple. An edit is reversible by pasting the old one back."
        footer="Only oklch(), rgb(), hsl(), a hex value or a CSS keyword is accepted. These strings end up inside a stylesheet, so anything that could close a rule and open another is refused rather than sanitised."
      >
        <RecordForm
          fields={FIELDS}
          initial={{
            'theme.color_primary': settings.theme.colorPrimary,
            'theme.color_accent': settings.theme.colorAccent,
            'theme.color_background': settings.theme.colorBackground,
            'theme.color_surface': settings.theme.colorSurface,
            'theme.color_credit': settings.theme.colorCredit,
            'theme.radius': settings.theme.radius,
            'theme.font_sans': settings.theme.fontSans,
            'theme.font_display': settings.theme.fontDisplay,
            'theme.mode': settings.theme.mode,
            'theme.animations': settings.theme.animations,
          }}
          action={saveTheme}
          submitLabel="Save the theme"
          successMessage="Theme saved."
          columns={2}
        />
      </AdminPanel>

      {settings.theme.mode === 'light' && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Light mode is set, and this build has no light theme. Every component was designed against
            a graphite canvas — contrast on a light background is not guaranteed anywhere. The
            frontend currently treats anything other than dark as dark; this is a stored preference,
            not a rendered one.
          </span>
        </p>
      )}

      <AdminPanel
        title="What the tokens are for"
        description="The three decisions the design system rests on, so a change can be made deliberately."
      >
        <ol className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1. Graphite, not black.</span> The canvas is
            dark enough to make footage glow and warm enough that a panel edge shows without a shadow.
            Pure black makes every border fight for contrast.
          </li>
          <li>
            <span className="font-medium text-foreground">2. Primary fills, accent marks.</span> One
            colour means “do this”. The accent annotates and counts. Two accents with one job each is
            what keeps a dark interface from turning into a fruit salad.
          </li>
          <li>
            <span className="font-medium text-foreground">3. Straight lines over glows.</span> The
            texture is a blueprint grid, a 1px highlight along a panel’s top edge and a linear light
            wash — not radial blobs. It costs no blur filter, which is also why it scrolls at 60fps.
          </li>
        </ol>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Contrast note</Badge>
          The primary is used as a fill under dark ink. A primary much darker than the shipped value
          will fail contrast on every button at once.
        </p>
      </AdminPanel>
    </>
  )
}
