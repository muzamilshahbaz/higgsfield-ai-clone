import { AlertTriangle, Power } from 'lucide-react'

import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-chrome'
import { ToggleAction } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { FLAG_DEFAULTS, type FlagKey } from '@/lib/flags'
import { Badge } from '@/components/ui/badge'
import { cmsList } from '@/services/cms/crud'

import { setFlag } from '../_actions/system'

/**
 * Feature flags.
 *
 * The screen where the consequence of a switch matters more than the switch, so every row
 * states it. "Disable generation" is not self-explanatory: it refuses new jobs and lets
 * running ones finish, which is what an operator wants during a provider outage and not what
 * they would assume.
 *
 * Maintenance mode is separated out and painted differently because it is the only flag that
 * takes the product away from everybody. Staff are exempt — the person who turned it on is
 * usually the person who then needs to check whether the thing they were fixing is fixed, and
 * locking them out of their own switch is how it stays on.
 *
 * One rule holds across all of them: a flag that cannot be read falls back to its shipped
 * default rather than to `false`. A database hiccup must not switch Explore off for
 * everybody.
 */

/** What each flag actually does, beyond its label. */
const CONSEQUENCES: Record<FlagKey, string> = {
  explore:
    'Off removes /explore and every /g permalink. Published work stays published — it is simply not browsable.',
  generation:
    'Off refuses new submissions with a clear message. Jobs already running finish and are charged normally.',
  billing: 'Off hides the pricing page, the plan cards and the checkout dialog. Existing subscriptions are untouched.',
  providers:
    'Off hides Settings → AI model keys. Keys already stored keep working, because breaking somebody’s running jobs is not what hiding a tab should mean.',
  registration: 'Off closes signup. Existing accounts sign in as normal.',
  comments: 'Off hides every thread and the comment form. Nothing is deleted.',
  downloads:
    'Off removes the download button from published work. An owner can always download their own files.',
  likes: 'Off removes the like button. Counts are preserved.',
  announcements: 'Off suppresses every scheduled banner at once, whatever each one’s own state says.',
  testimonials: 'Off removes the testimonials band even when quotes are published.',
  maintenance_mode:
    'On shows a maintenance notice instead of the studio to everybody except staff. The marketing site stays up.',
}

const GROUP_LABELS: Record<string, string> = {
  surfaces: 'Surfaces',
  commerce: 'Commerce',
  access: 'Access',
  social: 'Social',
  content: 'Content',
  system: 'System',
}

export default async function AdminFlagsPage() {
  await requireCapability('flags:write', '/admin/flags')

  const rows = await cmsList('feature_flags', { orderBy: 'sort_order' })

  const maintenance = rows.find((row) => row.key === 'maintenance_mode')
  const rest = rows.filter((row) => row.key !== 'maintenance_mode')
  const categories = [...new Set(rest.map((row) => row.category))]

  const off = rest.filter((row) => !row.enabled)

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="Feature flags"
        description="Kill switches for the surfaces of the product. Each one says what turning it off actually does."
      />

      {maintenance && (
        <AdminPanel
          title="Maintenance mode"
          description="The only flag that takes the studio away from everybody."
          className={maintenance.enabled ? 'border-destructive/50' : undefined}
          footer="Staff keep full access while this is on, deliberately: the person who turned it on is usually the person who needs to verify the fix."
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="flex items-center gap-2 font-medium">
                <Power
                  className={maintenance.enabled ? 'size-4 text-danger' : 'size-4 text-muted-foreground'}
                  aria-hidden
                />
                {maintenance.enabled ? 'The studio is in maintenance mode' : 'The studio is open'}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {CONSEQUENCES.maintenance_mode}
              </p>
            </div>

            <ToggleAction
              checked={maintenance.enabled}
              action={setFlag.bind(null, 'maintenance_mode')}
              label="Put the studio into maintenance mode"
              successMessage={
                maintenance.enabled ? 'Maintenance mode off. The studio is open.' : 'Maintenance mode on.'
              }
            />
          </div>

          {maintenance.enabled && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              Every non-staff visitor is seeing a maintenance notice instead of the studio right now.
            </p>
          )}
        </AdminPanel>
      )}

      {categories.map((category) => {
        const group = rest.filter((row) => row.category === category)

        return (
          <AdminPanel key={category} title={GROUP_LABELS[category] ?? category}>
            <ul className="divide-y divide-border/70">
              {group.map((row) => (
                <li key={row.key} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0 max-w-2xl">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {row.label}
                      <code className="font-mono text-[11px] text-muted-foreground">{row.key}</code>
                      {!row.enabled && (
                        <Badge variant="destructive" className="text-[10px]">
                          off
                        </Badge>
                      )}
                    </p>

                    {row.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {row.description}
                      </p>
                    )}

                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80">
                      {CONSEQUENCES[row.key as FlagKey] ?? 'No documented consequence for this flag.'}
                    </p>
                  </div>

                  <ToggleAction
                    checked={row.enabled}
                    action={setFlag.bind(null, row.key)}
                    label={`Enable ${row.label}`}
                    successMessage={row.enabled ? `${row.label} disabled.` : `${row.label} enabled.`}
                  />
                </li>
              ))}
            </ul>
          </AdminPanel>
        )
      })}

      <AdminPanel
        title="How a flag fails"
        description="The direction a fallback points in is the whole design."
      >
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every flag has a default in the code, and a flag that cannot be read falls back to it rather
          than to <code className="font-mono">false</code>. So a database hiccup leaves the product
          working exactly as it shipped, instead of switching Explore off for everybody at once.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Maintenance mode is the one that defaults the other way — to off — for the same reason
          reversed: a dropped connection must not take the studio down.
        </p>

        <dl className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {(Object.entries(FLAG_DEFAULTS) as [FlagKey, boolean][]).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-4 border-b border-border/60 pb-1.5">
              <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
              <dd>
                <Badge variant={value ? 'success' : 'secondary'} className="text-[10px]">
                  defaults {value ? 'on' : 'off'}
                </Badge>
              </dd>
            </div>
          ))}
        </dl>
      </AdminPanel>

      {off.length > 0 && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {off.length} feature{off.length === 1 ? ' is' : 's are'} currently switched off:{' '}
          {off.map((row) => row.label).join(', ')}.
        </p>
      )}
    </>
  )
}
