import { ExternalLink } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { isSectionKey } from '@/lib/cms/content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cmsList } from '@/services/cms/crud'
import { listMedia } from '@/services/cms/media.service'
import type { LandingSectionRow, NavGroup, NavLinkRow, WorkflowStepRow } from '@/types/cms'

import {
  createNavLink,
  createWorkflowStep,
  deleteNavLink,
  deleteWorkflowStep,
  reorderNavLinks,
  reorderSections,
  reorderWorkflowSteps,
  setNavLinkVisible,
  setSectionVisible,
  setWorkflowStepVisible,
  updateLandingSection,
  updateNavLink,
  updateWorkflowStep,
} from '../_actions/content'

/**
 * The landing page, band by band.
 *
 * Three panels, because the homepage is three different kinds of content and lumping
 * them together would make each one harder to find: the bands and their copy, the
 * "how it works" steps, and the navigation that the header and footer are built from.
 *
 * The bands are fixed. `key` names a component, so an operator can reorder them, hide
 * them and rewrite their copy — but not invent a `newsletter` band, because nothing
 * would render it. The table shows which component each row drives, and a row whose key
 * this build does not recognise is flagged rather than silently ignored.
 *
 * There is no Delete on a band for the same reason: deleting one does not remove a
 * section from the page, it removes the *copy* and leaves the built-in text behind.
 * Hiding is what an operator actually means, so hiding is what is offered.
 */

/** What each band is, in an operator's words, keyed by the component it drives. */
const BAND_NOTES: Record<string, string> = {
  hero: 'The first screen. Headline, subtitle, both buttons and the console preview.',
  stats: 'The numbers band. Edit the cells under Statistics.',
  overview: 'The surface map and the three points beside it. Cards under Features.',
  capabilities: 'Three cards that count the model registry. Cards under Features.',
  models: 'The full model roster, read from the registry. Presentation under Models.',
  workflow: 'The four-step rail. Steps in the panel below.',
  showcase: 'Published work from the feed, or reference photography when there is none.',
  features: 'The bento grid. Cards under Features.',
  pricing: 'Plan cards and the comparison table. Numbers under Plans.',
  testimonials: 'Renders only when a testimonial is published.',
  faq: 'The questions. Entries under FAQ.',
  cta: 'The closing call to action.',
}

function sectionFields(media: MediaOption[]): FieldSpec[] {
  return [
    {
      kind: 'text',
      name: 'index_label',
      label: 'Number',
      mono: true,
      half: true,
      maxLength: 4,
      help: 'The two-digit eyebrow number. Stored rather than counted, so a band that moves keeps the number the copy refers to.',
    },
    { kind: 'text', name: 'eyebrow', label: 'Eyebrow', half: true },
    { kind: 'text', name: 'title', label: 'Heading' },
    { kind: 'textarea', name: 'lead', label: 'Lead paragraph', rows: 3 },
    {
      kind: 'textarea',
      name: 'body',
      label: 'Supporting line',
      rows: 2,
      help: 'Used by the bands that have a second line under the lead.',
    },
    { kind: 'text', name: 'cta_label', label: 'Button label', half: true },
    { kind: 'text', name: 'cta_href', label: 'Button link', half: true },
    ...(media.length > 0
      ? ([{ kind: 'media', name: 'media_id', label: 'Background or feature image' }] as FieldSpec[])
      : []),
    {
      kind: 'json',
      name: 'config',
      label: 'Advanced',
      rows: 5,
      help: 'Band-specific settings as JSON. The hero uses "highlight" for the underlined phrase and "secondary_cta_label"; the tinted bands use "tinted". Leave it alone unless you know what a band reads.',
    },
  ]
}

function initialFor(row: LandingSectionRow) {
  return {
    index_label: row.index_label ?? '',
    eyebrow: row.eyebrow ?? '',
    title: row.title ?? '',
    lead: row.lead ?? '',
    body: row.body ?? '',
    cta_label: row.cta_label ?? '',
    cta_href: row.cta_href ?? '',
    media_id: row.media_id ?? '',
    config: JSON.stringify(row.config ?? {}, null, 2),
  }
}

const STEP_FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'title', label: 'Step', required: true, maxLength: 120 },
  { kind: 'textarea', name: 'body', label: 'What happens', rows: 3 },
  {
    kind: 'text',
    name: 'artefact',
    label: 'Artefact',
    mono: true,
    help: 'The mono line under the step, naming what you get back: “shot-04.mp4 · 1920×1080”.',
  },
  { kind: 'boolean', name: 'is_visible', label: 'Visible' },
]

const NAV_GROUPS: { value: NavGroup; label: string }[] = [
  { value: 'header', label: 'Header' },
  { value: 'footer_product', label: 'Footer · Product' },
  { value: 'footer_workspace', label: 'Footer · Workspace' },
  { value: 'footer_account', label: 'Footer · Account' },
  { value: 'footer_note', label: 'Footer · Good to know' },
  { value: 'social', label: 'Social links' },
  { value: 'legal', label: 'Legal' },
]

const NAV_FIELDS: FieldSpec[] = [
  {
    kind: 'select',
    name: 'nav_group',
    label: 'Group',
    options: NAV_GROUPS,
    half: true,
  },
  { kind: 'text', name: 'label', label: 'Label', required: true, half: true, maxLength: 60 },
  {
    kind: 'text',
    name: 'href',
    label: 'Link',
    mono: true,
    help: 'A path like /explore, or an anchor like #pricing. Leave empty for a plain note.',
  },
  {
    kind: 'boolean',
    name: 'is_route',
    label: 'This is a real path, not an anchor',
    help: 'An anchor is rewritten to /#pricing when the header renders on a page that is not the landing page. A path is left alone.',
  },
  {
    kind: 'boolean',
    name: 'is_external',
    label: 'Opens another site',
  },
  { kind: 'boolean', name: 'is_visible', label: 'Visible' },
]

function navInitial(row: NavLinkRow) {
  return {
    nav_group: row.nav_group,
    label: row.label,
    href: row.href,
    is_route: row.is_route,
    is_external: row.is_external,
    is_visible: row.is_visible,
  }
}

function stepInitial(row: WorkflowStepRow) {
  return {
    title: row.title,
    body: row.body,
    artefact: row.artefact ?? '',
    is_visible: row.is_visible,
  }
}

export default async function AdminLandingPage() {
  const actor = await requireCapability('content:read', '/admin/landing')
  const canWrite = can(actor.role, 'content:write')

  const [sections, steps, nav, mediaResult] = await Promise.all([
    cmsList('landing_sections', { orderBy: 'sort_order' }),
    cmsList('workflow_steps', { orderBy: 'sort_order' }),
    cmsList('nav_links', { orderBy: 'nav_group', thenBy: 'sort_order' }),
    listMedia({ includeInactive: false, limit: 60 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  const sectionSpec = sectionFields(media)
  const sectionKeys = sections.map((row) => row.key)
  const stepIds = steps.map((row) => row.id)

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Landing page"
        description="Every band on the homepage: its copy, its order and whether it renders at all."
        actions={
          <Button asChild variant="outline">
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Open the live page
            </a>
          </Button>
        }
      />

      {/* --------------------------------------------------------------- bands */}
      <AdminPanel
        title="Bands"
        description="Top to bottom, in this order. Hiding a band removes it from the page; there is no delete, because deleting the row would only remove your copy and leave the built-in text."
        footer="A band whose key this build does not recognise is skipped when the page renders rather than throwing — so a row added by hand cannot take the homepage down."
      >
        <AdminTable
          head={
            <>
              <Th className="w-20">Order</Th>
              <Th>Band</Th>
              <Th>Heading</Th>
              <Th className="w-24">Renders</Th>
              <Th className="w-28" />
            </>
          }
        >
          {sections.map((row) => (
            <tr key={row.key}>
              <Td>
                <ReorderButtons
                  ids={sectionKeys}
                  id={row.key}
                  action={reorderSections}
                  label={row.label}
                />
              </Td>

              <Td className="max-w-[18rem]">
                <p className="flex items-center gap-2 font-medium">
                  {row.index_label && (
                    <span className="font-mono text-xs text-brand">{row.index_label}</span>
                  )}
                  {row.label}
                  {!isSectionKey(row.key) && (
                    <Badge variant="warning" className="text-[10px]">
                      unknown key
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {BAND_NOTES[row.key] ?? (
                    <>
                      This build has no component for{' '}
                      <code className="font-mono">{row.key}</code>, so the band is skipped.
                    </>
                  )}
                </p>
              </Td>

              <Td className="max-w-[20rem]">
                <p className="truncate text-sm">{row.title ?? <span className="text-muted-foreground">built-in copy</span>}</p>
                {row.lead && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.lead}</p>
                )}
              </Td>

              <Td>
                <ToggleAction
                  checked={row.is_visible}
                  action={setSectionVisible.bind(null, row.key)}
                  label={`Render the ${row.label} band`}
                />
              </Td>

              <Td>
                <div className="flex justify-end">
                  <RecordDialog
                    title={`Edit the ${row.label} band`}
                    description={BAND_NOTES[row.key]}
                    fields={sectionSpec}
                    initial={initialFor(row)}
                    action={updateLandingSection.bind(null, row.key)}
                    mediaOptions={media}
                    columns={2}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      </AdminPanel>

      {/* ------------------------------------------------------------- workflow */}
      <AdminPanel
        title="How it works"
        description="The numbered rail in band 04. Each step ends in the artefact it produces."
        actions={
          <RecordDialog
            title="New step"
            fields={STEP_FIELDS}
            initial={{ is_visible: true }}
            action={createWorkflowStep}
            submitLabel="Add the step"
            successMessage="Step added."
            resetOnSave
            triggerLabel="New step"
            triggerVariant="outline"
          />
        }
      >
        {steps.length === 0 ? (
          <AdminEmpty
            title="No steps configured."
            description="The landing page is rendering the four steps it shipped with."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th className="w-20">Order</Th>
                <Th>Step</Th>
                <Th className="w-56">Artefact</Th>
                <Th className="w-24">Visible</Th>
                <Th className="w-36" />
              </>
            }
          >
            {steps.map((row) => (
              <tr key={row.id}>
                <Td>
                  <ReorderButtons
                    ids={stepIds}
                    id={row.id}
                    action={reorderWorkflowSteps}
                    label={row.title}
                  />
                </Td>
                <Td className="max-w-[24rem]">
                  <p className="font-medium">{row.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {row.body}
                  </p>
                </Td>
                <Td>
                  <code className="font-mono text-xs text-muted-foreground">
                    {row.artefact ?? '—'}
                  </code>
                </Td>
                <Td>
                  <ToggleAction
                    checked={row.is_visible}
                    action={setWorkflowStepVisible.bind(null, row.id)}
                    label={`Show the “${row.title}” step`}
                  />
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <RecordDialog
                      title={`Edit “${row.title}”`}
                      fields={STEP_FIELDS}
                      initial={stepInitial(row)}
                      action={updateWorkflowStep.bind(null, row.id)}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    />
                    <DeleteButton
                      action={deleteWorkflowStep.bind(null, row.id)}
                      what="this step"
                      description={<>“{row.title}” will be removed from the rail.</>}
                      iconOnly
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>

      {/* ----------------------------------------------------------- navigation */}
      <AdminPanel
        title="Navigation"
        description="The header and the footer columns. An anchor link is rewritten to /#section when the header renders off the landing page, which is why the distinction is a field."
        actions={
          <RecordDialog
            title="New link"
            fields={NAV_FIELDS}
            initial={{ nav_group: 'header', is_route: true, is_visible: true }}
            action={createNavLink}
            submitLabel="Add the link"
            successMessage="Link added."
            resetOnSave
            columns={2}
            triggerLabel="New link"
            triggerVariant="outline"
          />
        }
        footer="A group with no rows falls back to the links this app shipped with, so deleting every header link leaves the built-in nav rather than nothing."
      >
        {NAV_GROUPS.map((group) => {
          const links = nav.filter((row) => row.nav_group === group.value)
          if (links.length === 0) return null
          const ids = links.map((row) => row.id)

          return (
            <div key={group.value} className="mb-6 last:mb-0">
              <p className="eyebrow mb-2 text-muted-foreground">{group.label}</p>
              <AdminTable
                head={
                  <>
                    <Th className="w-20">Order</Th>
                    <Th>Label</Th>
                    <Th className="w-56">Link</Th>
                    <Th className="w-24">Visible</Th>
                    <Th className="w-36" />
                  </>
                }
              >
                {links.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <ReorderButtons
                        ids={ids}
                        id={row.id}
                        action={reorderNavLinks}
                        label={row.label}
                      />
                    </Td>
                    <Td className="font-medium">{row.label}</Td>
                    <Td>
                      <code className="font-mono text-xs text-muted-foreground">
                        {row.href || '—'}
                      </code>
                      {!row.is_route && row.href && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          anchor
                        </Badge>
                      )}
                      {row.is_external && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          external
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <ToggleAction
                        checked={row.is_visible}
                        action={setNavLinkVisible.bind(null, row.id)}
                        label={`Show the “${row.label}” link`}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <RecordDialog
                          title={`Edit “${row.label}”`}
                          fields={NAV_FIELDS.filter((field) => field.name !== 'nav_group')}
                          initial={navInitial(row)}
                          action={updateNavLink.bind(null, row.id)}
                          columns={2}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton
                          action={deleteNavLink.bind(null, row.id)}
                          what="this link"
                          description={<>“{row.label}” will be removed from {group.label}.</>}
                          iconOnly
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </div>
          )
        })}
      </AdminPanel>
    </AdminWriteScope>
  )
}
