import { KeyRound, Lock, ShieldAlert } from 'lucide-react'

import { AdminPageHeader, AdminPanel, AdminTable, Td, Th } from '@/components/admin/admin-chrome'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordForm } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { MODELS } from '@/lib/ai/registry'
import { getProviderViews } from '@/services/cms/catalogue.service'
import { Badge } from '@/components/ui/badge'
import { getSettingsForAdmin, listAllSettings } from '@/services/cms/settings.service'

import {
  saveGenerationSettings,
  saveLegalSettings,
  saveLimitSettings,
  saveSeoSettings,
  saveSiteSettings,
  saveStorageSettings,
} from '../_actions/system'

/**
 * System settings.
 *
 * Six panels, each saving as a batch. One save per panel rather than per field: an operator
 * pressing Save on eight fields expects one change, the audit trail should record one entry,
 * and a partial failure halfway through eight round trips leaves a panel in a state nobody
 * asked for.
 *
 * The panel that matters most is the last one, and it is deliberately not a form.
 * Infrastructure secrets stay environment variables — a database URL, a service-role key, a
 * JWT secret — and this screen says which ones and why rather than offering fields that
 * would move them somewhere worse. The one class of secret that IS configurable, vendor API
 * keys, lives sealed in its own screen behind its own capability.
 */

const SITE_FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'site.name', label: 'Site name', required: true, half: true },
  {
    kind: 'text',
    name: 'site.short_name',
    label: 'Short name',
    half: true,
    help: 'For the places that cannot fit two words — a 40px sidebar rail.',
  },
  { kind: 'text', name: 'site.tagline', label: 'Tagline' },
  {
    kind: 'textarea',
    name: 'site.description',
    label: 'Description',
    rows: 3,
    help: 'The meta description and the default Open Graph description.',
  },
  {
    kind: 'text',
    name: 'site.support_email',
    label: 'Support email',
    half: true,
    help: 'Shown in the footer and on the billing page.',
  },
]

const SEO_FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'seo.title_template',
    label: 'Title template',
    mono: true,
    help: 'Must contain %s, which is where the page name goes. Without it every page gets the same title.',
  },
  { kind: 'text', name: 'seo.default_title', label: 'Landing page title' },
  { kind: 'tags', name: 'seo.keywords', label: 'Keywords', help: 'Worth little for ranking; harmless.' },
  { kind: 'text', name: 'seo.og_image_url', label: 'Open Graph image', help: 'The 1200×630 card image.' },
  {
    kind: 'text',
    name: 'seo.twitter_handle',
    label: 'Twitter handle',
    half: true,
    help: 'Without the @.',
  },
  {
    kind: 'boolean',
    name: 'seo.robots_index',
    label: 'Allow search engines to index the site',
    help: 'Off writes a blanket disallow into robots.txt. Use it for a staging deploy — and remember to turn it back on.',
  },
]

const LIMIT_FIELDS: FieldSpec[] = [
  {
    kind: 'number',
    name: 'limits.max_prompt_length',
    label: 'Prompt length',
    half: true,
    min: 50,
    max: 20000,
    unit: 'characters',
  },
  {
    kind: 'number',
    name: 'limits.max_upload_mb',
    label: 'Upload size',
    half: true,
    min: 1,
    max: 10,
    unit: 'MB',
    help: 'The storage bucket enforces 10MB of its own, so a larger number here would be accepted by the app and refused by storage.',
  },
  {
    kind: 'number',
    name: 'limits.job_timeout_minutes',
    label: 'Job timeout',
    half: true,
    min: 1,
    max: 60,
    unit: 'minutes',
    help: 'After this the sweeper fails a stuck job and refunds it.',
  },
]

const STORAGE_FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'storage.provider',
    label: 'Provider',
    half: true,
    disabled: true,
    help: 'Supabase Storage is the only driver in this build.',
  },
  {
    kind: 'text',
    name: 'storage.uploads_bucket',
    label: 'Private bucket',
    half: true,
    mono: true,
    help: 'Reference images. One folder per user, private by policy.',
  },
  {
    kind: 'text',
    name: 'storage.media_bucket',
    label: 'Public bucket',
    half: true,
    mono: true,
    help: 'Generated media and CMS uploads. Public read, service-role write.',
  },
]

const LEGAL_FIELDS: FieldSpec[] = [
  {
    kind: 'textarea',
    name: 'legal.billing_disclaimer',
    label: 'Billing disclaimer',
    required: true,
    rows: 3,
    help: 'Cannot be empty while checkout is simulated.',
  },
  { kind: 'textarea', name: 'legal.copyright', label: 'Copyright line', rows: 2 },
]

/**
 * What stays in the environment, and why.
 *
 * Listed rather than implied. An operator looking for "where do I change the database URL"
 * should find the answer here instead of concluding the panel is incomplete.
 */
const ENVIRONMENT_ONLY = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    reason: 'Identifies the database. A database that can repoint itself is not a database.',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    reason:
      'Bypasses row-level security entirely. Storing it in the database it unlocks would be a circular dependency and a single point of total compromise.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    reason: 'Public by design, but it is how the app reaches the database at all — so it cannot come from there.',
  },
  {
    name: 'AI_KEY_ENCRYPTION_SECRET',
    reason:
      'Seals every stored vendor key. Keeping it beside the ciphertext would make the encryption decorative.',
  },
  {
    name: 'CRON_SECRET',
    reason: 'Authenticates the sweeper. A compromised database should not be able to mint its own.',
  },
  {
    name: 'SUPABASE_DB_PASSWORD',
    reason: 'Used by the migration scripts, never by the running application.',
  },
]

export default async function AdminSettingsPage() {
  const actor = await requireCapability('settings:read', '/admin/settings')
  const canWrite = can(actor.role, 'settings:write')

  const [settings, rows, providers] = await Promise.all([
    getSettingsForAdmin(),
    listAllSettings(),
    getProviderViews(),
  ])

  const generationFields: FieldSpec[] = [
    {
      kind: 'select',
      name: 'generation.default_task',
      label: 'Composer opens on',
      options: [
        { value: 'text_to_image', label: 'Image' },
        { value: 'image_to_video', label: 'Image to video' },
        { value: 'text_to_video', label: 'Video' },
      ],
      half: true,
    },
    {
      kind: 'select',
      name: 'generation.default_provider',
      label: 'Preferred provider',
      options: providers
        .filter((provider) => provider.generationReady)
        .map((provider) => ({ value: provider.id, label: provider.label })),
      allowEmpty: true,
      emptyLabel: '— registry order —',
      half: true,
      help: 'Tried first when a user has keys for several. Leave empty to use the order the registry declares.',
    },
    {
      kind: 'select',
      name: 'generation.default_image_model',
      label: 'Default image model',
      options: MODELS.filter((model) => model.task === 'text_to_image').map((model) => ({
        value: model.id,
        label: `${model.label} — ${model.credits} credits`,
      })),
      half: true,
    },
    {
      kind: 'select',
      name: 'generation.default_video_model',
      label: 'Default video model',
      options: MODELS.filter((model) => model.task !== 'text_to_image').map((model) => ({
        value: model.id,
        label: `${model.label} — ${model.credits} credits`,
      })),
      half: true,
    },
  ]

  const readOnly = !canWrite

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="Settings"
        description="Application configuration, stored in the database. Infrastructure secrets stay in the environment — the last panel says which and why."
      />

      {readOnly && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your role can read these settings but not change them. The current values are shown below.
        </p>
      )}

      <AdminPanel
        title="Site"
        description="Names and the description every page inherits."
        footer="Saving this revalidates every route, because the name and tagline are in the root layout's metadata."
      >
        {canWrite ? (
          <RecordForm
            fields={SITE_FIELDS}
            initial={{
              'site.name': settings.site.name,
              'site.short_name': settings.site.shortName,
              'site.tagline': settings.site.tagline,
              'site.description': settings.site.description,
              'site.support_email': settings.site.supportEmail ?? '',
            }}
            action={saveSiteSettings}
            submitLabel="Save the site settings"
            columns={2}
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Name', settings.site.name],
              ['Short name', settings.site.shortName],
              ['Tagline', settings.site.tagline],
              ['Description', settings.site.description],
              ['Support email', settings.site.supportEmail ?? '—'],
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel
        title="SEO and sharing"
        description="Titles, keywords and the Open Graph card."
        footer="Turning indexing off writes a blanket disallow into robots.txt for the whole site. It is the right thing for a staging deploy and the wrong thing to leave on."
      >
        {canWrite ? (
          <RecordForm
            fields={SEO_FIELDS}
            initial={{
              'seo.title_template': settings.seo.titleTemplate,
              'seo.default_title': settings.seo.defaultTitle,
              'seo.keywords': settings.seo.keywords,
              'seo.og_image_url': settings.seo.ogImageUrl ?? '',
              'seo.twitter_handle': settings.seo.twitterHandle ?? '',
              'seo.robots_index': settings.seo.robotsIndex,
            }}
            action={saveSeoSettings}
            submitLabel="Save SEO"
            columns={2}
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Title template', settings.seo.titleTemplate],
              ['Landing title', settings.seo.defaultTitle],
              ['Keywords', settings.seo.keywords.join(', ') || '—'],
              ['Indexing', settings.seo.robotsIndex ? 'Allowed' : 'Disallowed'],
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel
        title="Generation defaults"
        description="What the composer opens on. Model ids are checked against the registry on save."
      >
        {canWrite ? (
          <RecordForm
            fields={generationFields}
            initial={{
              'generation.default_task': settings.generation.defaultTask,
              'generation.default_image_model': settings.generation.defaultImageModel,
              'generation.default_video_model': settings.generation.defaultVideoModel,
              'generation.default_provider': settings.generation.defaultProvider ?? '',
            }}
            action={saveGenerationSettings}
            submitLabel="Save the defaults"
            columns={2}
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Opens on', settings.generation.defaultTask],
              ['Image model', settings.generation.defaultImageModel],
              ['Video model', settings.generation.defaultVideoModel],
              ['Provider', settings.generation.defaultProvider ?? 'registry order'],
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel
        title="Limits"
        description="Guardrails on prompt length, upload size and how long a job may hang."
        footer="Per-plan concurrency and hourly limits are not here — they belong to a plan and are edited under Plans, where the tier they apply to is visible."
      >
        {canWrite ? (
          <RecordForm
            fields={LIMIT_FIELDS}
            initial={{
              'limits.max_prompt_length': settings.limits.maxPromptLength,
              'limits.max_upload_mb': settings.limits.maxUploadMb,
              'limits.job_timeout_minutes': settings.limits.jobTimeoutMinutes,
            }}
            action={saveLimitSettings}
            submitLabel="Save the limits"
            columns={2}
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Prompt length', `${settings.limits.maxPromptLength} characters`],
              ['Upload size', `${settings.limits.maxUploadMb} MB`],
              ['Job timeout', `${settings.limits.jobTimeoutMinutes} minutes`],
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel title="Storage" description="Which buckets media is written to.">
        {canWrite ? (
          <RecordForm
            fields={STORAGE_FIELDS}
            initial={{
              'storage.provider': settings.storage.provider,
              'storage.uploads_bucket': settings.storage.uploadsBucket,
              'storage.media_bucket': settings.storage.mediaBucket,
            }}
            action={saveStorageSettings}
            submitLabel="Save storage"
            columns={2}
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Provider', settings.storage.provider],
              ['Private bucket', settings.storage.uploadsBucket],
              ['Public bucket', settings.storage.mediaBucket],
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel
        title="Legal"
        description="The copyright line and the billing disclaimer."
        footer="The disclaimer refuses to save empty while checkout is simulated. A pricing page that stops disclosing that no card is charged is misleading rather than merely terse."
      >
        {canWrite ? (
          <RecordForm
            fields={LEGAL_FIELDS}
            initial={{
              'legal.billing_disclaimer': settings.legal.billingDisclaimer,
              'legal.copyright': settings.legal.copyright,
            }}
            action={saveLegalSettings}
            submitLabel="Save the legal copy"
          />
        ) : (
          <ReadOnlyList
            entries={[
              ['Disclaimer', settings.legal.billingDisclaimer],
              ['Copyright', settings.legal.copyright],
            ]}
          />
        )}
      </AdminPanel>

      {/* ---------------------------------------------------- environment only */}
      <AdminPanel
        title="Environment variables"
        description="Configuration this panel deliberately cannot change."
        footer="Vendor API keys are the one class of secret that IS configurable here, because rotating one is an operational task rather than an infrastructure change. They live sealed under AI → Provider keys, behind their own permission."
      >
        <p className="mb-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          Each of these is read from the process environment and nowhere else. Moving any of them into
          the database would put the key to a lock inside the box it opens.
        </p>

        <AdminTable
          head={
            <>
              <Th className="w-72">Variable</Th>
              <Th>Why it stays out of the database</Th>
            </>
          }
        >
          {ENVIRONMENT_ONLY.map((entry) => (
            <tr key={entry.name}>
              <Td>
                <code className="font-mono text-xs">{entry.name}</code>
              </Td>
              <Td className="text-xs leading-relaxed text-muted-foreground">{entry.reason}</Td>
            </tr>
          ))}
        </AdminTable>
      </AdminPanel>

      <AdminPanel
        title="Stored keys"
        description="Every settings row in the database, for reference. A row marked secret has its value withheld from this screen."
      >
        <AdminTable
          head={
            <>
              <Th className="w-56">Key</Th>
              <Th className="w-28">Category</Th>
              <Th>Value</Th>
              <Th className="w-24">Public</Th>
            </>
          }
        >
          {rows.map((row) => (
            <tr key={row.key}>
              <Td>
                <code className="font-mono text-[11px]">{row.key}</code>
              </Td>
              <Td className="text-xs text-muted-foreground">{row.category}</Td>
              <Td className="max-w-[26rem]">
                <code className="line-clamp-2 font-mono text-[11px] text-muted-foreground">
                  {row.is_secret ? '[redacted]' : JSON.stringify(row.value)}
                </code>
              </Td>
              <Td>
                {row.is_secret ? (
                  <Badge variant="destructive" className="gap-1">
                    <KeyRound className="size-3" aria-hidden />
                    secret
                  </Badge>
                ) : row.is_public ? (
                  <Badge variant="success">yes</Badge>
                ) : (
                  <Badge variant="secondary">server</Badge>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      </AdminPanel>
    </>
  )
}

/** The read-only rendering for an operator who can see settings but not change them. */
function ReadOnlyList({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="space-y-2.5">
      {entries.map(([label, value]) => (
        <div key={label} className="border-b border-border/60 pb-2.5 last:border-0">
          <dt className="eyebrow text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm leading-relaxed">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
