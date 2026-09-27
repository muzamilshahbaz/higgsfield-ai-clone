import { AdminEmpty, AdminPageHeader, AdminPanel, StatTile } from '@/components/admin/admin-chrome'
import { FilterChips } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { getModel } from '@/lib/ai/registry'
import { getProvider } from '@/lib/ai/catalogue'
import { Badge } from '@/components/ui/badge'
import {
  getDailySeries,
  getModelUsage,
  getOverview,
  getProviderUsage,
} from '@/services/admin/analytics.service'

/**
 * Analytics.
 *
 * Charts drawn as CSS bars rather than with a charting library. Three reasons, in order of how
 * much they matter: a bar chart of thirty values needs no library, a library would put
 * 40–100KB of JavaScript on a page that is server-rendered and static, and a `<div>` with a
 * height is readable by a screen reader when it carries the number in its label — where a
 * canvas is not.
 *
 * Every series comes back from SQL left-joined onto a generated date range, so a day with no
 * activity is a zero rather than a gap. That is the difference between a line that dips and a
 * line that lies.
 */

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

/**
 * A horizontal bar row.
 *
 * `aria-hidden` on the bar and the real number in the text, so the chart reads correctly
 * without the visual — the bar is decoration for a value that is already stated.
 */
function BarRow({
  label,
  detail,
  value,
  max,
  tone = 'primary',
}: {
  label: string
  detail?: string
  value: number
  max: number
  tone?: 'primary' | 'accent' | 'credit'
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  const colour =
    tone === 'accent' ? 'bg-accent' : tone === 'credit' ? 'bg-credit' : 'bg-primary'

  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${width}%` }} />
      </div>
      <p className="w-16 text-right text-sm tabular-nums">{value.toLocaleString('en-GB')}</p>
    </div>
  )
}

/**
 * The daily column chart.
 *
 * A `<ul>` of columns with the value in each `title` and in a screen-reader-only span, so the
 * data is available three ways: visually, on hover, and to assistive technology.
 */
function DailyChart({
  days,
  label,
  tone = 'primary',
}: {
  days: { day: string; value: number }[]
  label: string
  tone?: 'primary' | 'accent' | 'credit'
}) {
  const max = Math.max(...days.map((day) => day.value), 1)
  const total = days.reduce((sum, day) => sum + day.value, 0)
  const colour = tone === 'accent' ? 'bg-accent' : tone === 'credit' ? 'bg-credit' : 'bg-primary'

  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="eyebrow text-muted-foreground">{label}</span>
        <span className="text-sm tabular-nums">
          {total.toLocaleString('en-GB')} <span className="text-muted-foreground">total</span>
        </span>
      </figcaption>

      <ul className="flex h-32 items-end gap-px">
        {days.map((day) => {
          const height = Math.max(2, Math.round((day.value / max) * 100))
          return (
            <li
              key={day.day}
              className="group relative flex-1"
              title={`${day.day}: ${day.value.toLocaleString('en-GB')}`}
            >
              <div
                className={`w-full rounded-t-sm ${colour} opacity-80 transition-opacity group-hover:opacity-100`}
                style={{ height: `${height}%` }}
              />
              <span className="sr-only">
                {day.day}: {day.value}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{days[0]?.day}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </figure>
  )
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  await requireCapability('analytics:read', '/admin/analytics')
  const params = await searchParams

  const days = [7, 30, 90].includes(Number(params.range)) ? Number(params.range) : 30

  const [overview, series, models, providers] = await Promise.all([
    getOverview(),
    getDailySeries(days),
    getModelUsage(days, 10),
    getProviderUsage(days),
  ])

  const generations = series.reduce((sum, row) => sum + row.generations, 0)
  const signups = series.reduce((sum, row) => sum + row.signups, 0)
  const spent = series.reduce((sum, row) => sum + row.credits_spent, 0)
  const revenue = series.reduce((sum, row) => sum + row.revenue_minor, 0)

  const modelMax = Math.max(...models.map((entry) => entry.count), 1)
  const providerMax = Math.max(...providers.map((entry) => entry.count), 1)

  return (
    <>
      <AdminPageHeader
        eyebrow="Overview"
        title="Analytics"
        description="Generations, signups, credit spend and simulated revenue over time."
        actions={<FilterChips paramName="range" options={RANGES} allLabel="30 days" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Generations, ${days}d`}
          value={generations}
          detail={`${overview.generations_24h} in the last 24 hours`}
          tone="brand"
        />
        <StatTile label={`Signups, ${days}d`} value={signups} detail={`${overview.users} accounts total`} />
        <StatTile label={`Credits spent, ${days}d`} value={spent} tone="credit" />
        <StatTile
          label={`Revenue, ${days}d`}
          value={`$${(revenue / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
          detail="Simulated — no card is charged"
        />
      </div>

      {series.length === 0 ? (
        <AdminEmpty
          title="No activity data."
          description="The series comes from a database function; if this is empty the function could not be reached."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel title="Generations per day">
            <DailyChart
              days={series.map((row) => ({ day: row.day, value: row.generations }))}
              label="Jobs submitted"
            />
          </AdminPanel>

          <AdminPanel title="Signups per day">
            <DailyChart
              days={series.map((row) => ({ day: row.day, value: row.signups }))}
              label="New accounts"
              tone="accent"
            />
          </AdminPanel>

          <AdminPanel title="Credits spent per day">
            <DailyChart
              days={series.map((row) => ({ day: row.day, value: row.credits_spent }))}
              label="Debits"
              tone="credit"
            />
          </AdminPanel>

          <AdminPanel
            title="Revenue per day"
            description="Simulated. The gateway records transactions exactly as a real one would, but no card is charged."
          >
            <DailyChart
              days={series.map((row) => ({ day: row.day, value: Math.round(row.revenue_minor / 100) }))}
              label="Dollars"
              tone="credit"
            />
          </AdminPanel>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel
          title="Most used models"
          description={`Over the last ${days} days. Counted from the generation rows, capped so the read stays cheap.`}
        >
          {models.length === 0 ? (
            <AdminEmpty title="No generations in this window." />
          ) : (
            <div className="space-y-3">
              {models.map((entry) => {
                const model = getModel(entry.modelId)
                return (
                  <BarRow
                    key={entry.modelId}
                    label={model?.label ?? entry.modelId}
                    detail={model ? `${model.family} · ${model.credits} credits` : 'not in the registry'}
                    value={entry.count}
                    max={modelMax}
                  />
                )
              })}
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          title="Provider share"
          description="Which vendor actually ran each job, as recorded on the generation row."
        >
          {providers.length === 0 ? (
            <AdminEmpty title="No generations in this window." />
          ) : (
            <div className="space-y-3">
              {providers.map((entry) => (
                <BarRow
                  key={entry.provider}
                  label={getProvider(entry.provider)?.label ?? entry.provider}
                  value={entry.count}
                  max={providerMax}
                  tone="accent"
                />
              ))}
            </div>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Platform totals" description="All time, not windowed.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Accounts" value={overview.users} detail={`${overview.staff} staff`} />
          <StatTile label="Projects" value={overview.projects} />
          <StatTile label="Generations" value={overview.generations} detail={`${overview.assets} files`} />
          <StatTile label="Published" value={overview.public_shots} detail={`${overview.comments} comments`} />
          <StatTile label="Credits held" value={overview.credits_held} tone="credit" />
          <StatTile
            label="Paid subscriptions"
            value={overview.subscriptions_paid}
            detail="active, trialing or past due"
          />
          <StatTile
            label="Failed jobs"
            value={overview.generations_failed}
            detail="all refunded"
            tone={overview.generations_failed > 0 ? 'warn' : 'default'}
          />
          <StatTile
            label="In flight"
            value={overview.generations_running}
            detail="queued or rendering"
          />
        </div>
      </AdminPanel>

      <p className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-muted-foreground">
        <Badge variant="outline">No tracking</Badge>
        Everything on this page is counted from rows the product already writes — generations,
        accounts, ledger entries, transactions. There is no analytics vendor, no session recording and
        no visitor-level data anywhere in this build.
      </p>
    </>
  )
}
