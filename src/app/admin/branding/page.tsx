import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-chrome'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordForm } from '@/components/admin/record-form'
import { KineticLogo } from '@/components/brand/logo'
import { requireCapability } from '@/lib/admin/guard'
import { Button } from '@/components/ui/button'
import { listMedia } from '@/services/cms/media.service'
import { getSettingsForAdmin } from '@/services/cms/settings.service'

import { saveBranding } from '../_actions/system'

/**
 * Branding.
 *
 * Three values and a live preview, because a logo is the one setting where the field cannot
 * tell you whether it worked. The preview renders exactly what the header will: the uploaded
 * mark if there is one, the built-in mark if there is not, and the wordmark beside it if it
 * is switched on.
 *
 * Both URL fields require https. They are rendered as an `src`, so a relative value would be
 * broken and a `javascript:` one would be a link somebody clicks — and the media picker is
 * offered first precisely so most operators never type a URL at all.
 */

function fields(media: MediaOption[]): FieldSpec[] {
  return [
    ...(media.length > 0
      ? ([
          {
            kind: 'media',
            name: 'branding.logo_media',
            label: 'Logo from the library',
            help: 'Picking one fills the URL field below. Uploads go under Media.',
          },
        ] as FieldSpec[])
      : []),
    {
      kind: 'text',
      name: 'branding.logo_url',
      label: 'Logo URL',
      mono: true,
      help: 'Must be https. Replaces the built-in mark everywhere — the header, the studio rail and the footer. Leave empty to keep the built-in one.',
    },
    {
      kind: 'text',
      name: 'branding.favicon_url',
      label: 'Favicon URL',
      mono: true,
      help: 'Must be https. A 32×32 PNG or an ICO. Empty falls back to the generated icon route.',
    },
    {
      kind: 'text',
      name: 'branding.wordmark_text',
      label: 'Wordmark',
      half: true,
      help: 'The text beside the mark. Usually the site name.',
    },
    {
      kind: 'boolean',
      name: 'branding.show_wordmark',
      label: 'Show the wordmark',
      help: 'Off leaves just the mark, which is what a distinctive logo usually wants.',
    },
  ]
}

export default async function AdminBrandingPage() {
  await requireCapability('settings:write', '/admin/branding')

  const [settings, mediaResult] = await Promise.all([
    getSettingsForAdmin(),
    listMedia({ includeInactive: false, folder: 'brand', limit: 40 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="Branding"
        description="The mark, the favicon and the wordmark. The frontend reads these at render time, so a change is live on the next navigation."
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
        description="Exactly what the header renders — the custom mark if one is set, the built-in one otherwise."
      >
        <div className="flex flex-wrap items-center gap-8 rounded-lg border border-border bg-background p-6">
          <div>
            <p className="eyebrow mb-3 text-muted-foreground">On the canvas</p>
            {settings.branding.logoUrl ? (
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.branding.logoUrl}
                  alt=""
                  className="h-7 w-auto max-w-[10rem] object-contain"
                />
                {settings.branding.showWordmark && (
                  <span className="font-display text-base font-semibold">
                    {settings.branding.wordmarkText}
                  </span>
                )}
              </div>
            ) : (
              <KineticLogo />
            )}
          </div>

          <div>
            <p className="eyebrow mb-3 text-muted-foreground">On a panel</p>
            <div className="rounded-lg bg-surface p-4">
              {settings.branding.logoUrl ? (
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.branding.logoUrl}
                    alt=""
                    className="h-7 w-auto max-w-[10rem] object-contain"
                  />
                  {settings.branding.showWordmark && (
                    <span className="font-display text-base font-semibold">
                      {settings.branding.wordmarkText}
                    </span>
                  )}
                </div>
              ) : (
                <KineticLogo />
              )}
            </div>
          </div>

          {settings.branding.faviconUrl && (
            <div>
              <p className="eyebrow mb-3 text-muted-foreground">Favicon</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.branding.faviconUrl}
                alt=""
                className="size-8 rounded border border-border object-contain"
              />
            </div>
          )}
        </div>
      </AdminPanel>

      <AdminPanel
        title="Assets"
        description="Upload under Media first, then pick here — or paste an https URL."
        footer="A logo replaces the built-in mark on every surface at once: the marketing header, the studio rail and the footer. There is no per-surface override, because a brand with three different marks is not a brand."
      >
        <RecordForm
          fields={fields(media)}
          initial={{
            'branding.logo_url': settings.branding.logoUrl ?? '',
            'branding.favicon_url': settings.branding.faviconUrl ?? '',
            'branding.wordmark_text': settings.branding.wordmarkText,
            'branding.show_wordmark': settings.branding.showWordmark,
          }}
          action={saveBranding}
          submitLabel="Save branding"
          successMessage="Branding saved. Reload the live site to see it."
          mediaOptions={media}
        />
      </AdminPanel>

      {media.length === 0 && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          There is nothing in the <code className="font-mono">brand</code> folder of the media library
          yet, so only the URL fields are offered. Upload a logo under Media with the folder set to
          brand and it will appear here as a picker.
        </p>
      )}
    </>
  )
}
