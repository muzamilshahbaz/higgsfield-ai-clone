import { CheckCircle2, ExternalLink, KeyRound, Lock } from 'lucide-react'

import {
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getProviderViews, listProviderRows } from '@/services/cms/catalogue.service'
import { appKeySources } from '@/services/cms/provider-keys.service'
import { listMedia } from '@/services/cms/media.service'
import type { AiProviderRow } from '@/types/cms'

import { reorderProviders, setProviderEnabled, updateProvider } from '../_actions/catalogue'

/**
 * AI providers.
 *
 * Two columns carry the only facts on this screen that an operator cannot change, and
 * both are read-only for the same reason: they describe the code, not a preference.
 *
 *   `generation_ready` is true when a driver exists in services/ai/providers/ and a model
 *   in the registry routes to the vendor. A switch claiming otherwise would produce jobs
 *   that fail and refund, so the form shows it as a fact.
 *
 *   The key source says where the credential a generation would actually use comes from:
 *   the database, an environment variable, or nowhere. That is worth stating plainly —
 *   "not configured" covers two situations with completely different fixes.
 *
 * `is_enabled` is editable and means what it says: users cannot connect a new key for a
 * disabled vendor. Keys already stored keep working, because breaking somebody's running
 * jobs is not what "hide this row" should mean.
 */

const MEDIA_KINDS = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'both', label: 'Both' },
]

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'beta', label: 'Beta' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'disabled', label: 'Disabled' },
]

function fields(media: MediaOption[]): FieldSpec[] {
  return [
    { kind: 'text', name: 'label', label: 'Display name', required: true, half: true },
    { kind: 'select', name: 'media', label: 'Produces', options: MEDIA_KINDS, half: true },
    {
      kind: 'textarea',
      name: 'description',
      label: 'Description',
      rows: 2,
      help: 'One line, for somebody deciding whether to connect an account.',
    },
    {
      kind: 'text',
      name: 'console_url',
      label: 'Where to get a key',
      half: true,
      help: 'Linked from the settings page. The single most useful field here.',
    },
    { kind: 'text', name: 'docs_url', label: 'Documentation', half: true },
    ...(media.length > 0
      ? ([{ kind: 'media', name: 'logo_media_id', label: 'Logo' }] as FieldSpec[])
      : []),
    { kind: 'text', name: 'logo_url', label: 'Logo URL', half: true, help: 'If not using the library.' },
    { kind: 'select', name: 'status', label: 'Status', options: STATUSES, half: true },
    {
      kind: 'text',
      name: 'key_placeholder',
      label: 'Key placeholder',
      mono: true,
      help: 'Shown in the input so somebody can see the shape a key should have.',
    },
    {
      kind: 'number',
      name: 'key_min_length',
      label: 'Minimum key length',
      half: true,
      min: 4,
      max: 512,
      help: 'Catches a truncated paste before a network round trip. Not a gate.',
    },
    {
      kind: 'text',
      name: 'key_pattern',
      label: 'Key pattern',
      mono: true,
      half: true,
      help: 'A regular expression, checked before submitting. `^hf_` or `:` — loose on purpose; a vendor changing its format should cost one warning, not a locked-out account.',
    },
    {
      kind: 'boolean',
      name: 'is_recommended',
      label: 'Recommended',
      help: 'Surfaced first on the settings page.',
    },
  ]
}

function initialFor(row: AiProviderRow) {
  return {
    label: row.label,
    media: row.media,
    description: row.description,
    console_url: row.console_url ?? '',
    docs_url: row.docs_url ?? '',
    logo_media_id: row.logo_media_id ?? '',
    logo_url: row.logo_url ?? '',
    status: row.status,
    key_placeholder: row.key_placeholder,
    key_min_length: row.key_min_length,
    key_pattern: row.key_pattern ?? '',
    is_recommended: row.is_recommended,
  }
}

const SOURCE_LABELS: Record<string, { label: string; variant: 'success' | 'secondary' | 'warning' }> =
  {
    database: { label: 'Stored here', variant: 'success' },
    environment: { label: 'Environment', variant: 'secondary' },
    none: { label: 'Not configured', variant: 'warning' },
  }

export default async function AdminProvidersPage() {
  const actor = await requireCapability('providers:read', '/admin/providers')
  const canWrite = can(actor.role, 'providers:write')
  const canSecrets = can(actor.role, 'secrets:read')

  const [views, rows, sources, mediaResult] = await Promise.all([
    getProviderViews(),
    listProviderRows(),
    // Typed rather than `{}`, so the lookup below stays a string index and does not
    // widen to `any` when the empty branch is taken.
    canSecrets ? appKeySources() : Promise.resolve<Record<string, string>>({}),
    listMedia({ includeInactive: false, folder: 'brand', limit: 40 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const ids = views.map((view) => view.id)
  const spec = fields(media)

  const ready = views.filter((view) => view.generationReady)
  const enabled = views.filter((view) => view.isEnabled)

  return (
    <>
      <AdminPageHeader
        eyebrow="AI"
        title="Providers"
        description="The vendors a user can connect an account to. What each one is, where to get a key, and whether this build can route a generation through it."
        actions={
          canSecrets ? (
            <Button asChild variant="outline">
              <a href="/admin/providers/keys">
                <KeyRound className="size-4" aria-hidden />
                Shared keys
              </a>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Catalogued"
          value={views.length}
          detail={`${enabled.length} enabled for users`}
        />
        <StatTile
          label="Can run a generation"
          value={ready.length}
          detail="a driver ships and a model routes to it"
          tone="brand"
          icon={CheckCircle2}
        />
        <StatTile
          label="Store a key only"
          value={views.length - ready.length}
          detail="verified, but nothing routes there yet"
        />
      </div>

      <AdminPanel
        title="Catalogue"
        description="Ordered as the settings page lists them. The three aggregators come first because one key serves many models."
        footer="“Can generate” is read from the code — whether a driver exists and a model names the vendor — and is not editable. A switch claiming a vendor could run a job when no driver ships for it would produce failed generations and refunds."
      >
        <AdminTable
          head={
            <>
              {canWrite && <Th className="w-20">Order</Th>}
              <Th>Provider</Th>
              <Th className="w-24">Produces</Th>
              <Th className="w-32">Can generate</Th>
              {canSecrets && <Th className="w-32">Shared key</Th>}
              <Th className="w-28">Status</Th>
              <Th className="w-24">Enabled</Th>
              <Th className="w-32" />
            </>
          }
        >
          {views.map((view) => {
            const row = byId.get(view.id)
            const source = sources[view.id]

            return (
              <tr key={view.id}>
                {canWrite && (
                  <Td>
                    <ReorderButtons
                      ids={ids}
                      id={view.id}
                      action={reorderProviders}
                      label={view.label}
                    />
                  </Td>
                )}

                <Td className="max-w-[24rem]">
                  <p className="flex items-center gap-2 font-medium">
                    {view.label}
                    {view.isRecommended && (
                      <Badge variant="default" className="text-[10px]">
                        recommended
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {view.description}
                  </p>
                  {view.consoleUrl && (
                    <a
                      href={view.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      key console
                    </a>
                  )}
                </Td>

                <Td className="text-xs text-muted-foreground">{view.media}</Td>

                <Td>
                  {view.generationReady ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="size-3" aria-hidden />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" aria-hidden />
                      Key only
                    </Badge>
                  )}
                </Td>

                {canSecrets && (
                  <Td>
                    {source ? (
                      <Badge variant={SOURCE_LABELS[source]?.variant ?? 'secondary'}>
                        {SOURCE_LABELS[source]?.label ?? source}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                )}

                <Td>
                  <Badge
                    variant={
                      view.status === 'active'
                        ? 'success'
                        : view.status === 'disabled'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {view.status}
                  </Badge>
                </Td>

                <Td>
                  {canWrite ? (
                    <ToggleAction
                      checked={view.isEnabled}
                      action={setProviderEnabled.bind(null, view.id)}
                      label={`Let users connect a ${view.label} key`}
                    />
                  ) : (
                    <Badge variant={view.isEnabled ? 'success' : 'secondary'}>
                      {view.isEnabled ? 'Yes' : 'No'}
                    </Badge>
                  )}
                </Td>

                <Td>
                  {canWrite && row && (
                    <div className="flex justify-end">
                      <RecordDialog
                        title={`Edit ${view.label}`}
                        description="How the vendor is presented on the settings page. Whether it can run a generation is decided by the code."
                        fields={spec}
                        initial={initialFor(row)}
                        action={updateProvider.bind(null, view.id)}
                        mediaOptions={media}
                        columns={2}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                    </div>
                  )}
                </Td>
              </tr>
            )
          })}
        </AdminTable>
      </AdminPanel>

      {canSecrets && (
        <AdminPanel
          title="What “Shared key” means"
          description="The routing chain, in order."
        >
          <ol className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. The user’s own key.</span> Their quota,
              their rate limit, their bill. Connected under Settings → AI model keys.
            </li>
            <li>
              <span className="font-medium text-foreground">2. The shared key stored here.</span>{' '}
              Covers everyone who has not connected one. Rotatable from the admin panel without a
              redeploy.
            </li>
            <li>
              <span className="font-medium text-foreground">3. The environment variable.</span> The
              fallback, and what a deployment that never opens this panel uses.
            </li>
            <li>
              <span className="font-medium text-foreground">Nothing.</span> The job is refused with a
              message naming what to connect. It is never quietly mocked.
            </li>
          </ol>
        </AdminPanel>
      )}
    </>
  )
}
