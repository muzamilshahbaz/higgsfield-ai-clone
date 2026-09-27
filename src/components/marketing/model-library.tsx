import Link from 'next/link'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TASK_LABELS } from '@/lib/constants'
import type { LandingSection } from '@/lib/cms/content'
import type { ModelView } from '@/services/cms/catalogue.service'
import type { GenerationTask } from '@/types/database'

/**
 * The supported-models roster.
 *
 * A spec sheet, not a card grid. Cards would give six near-identical tiles per task and bury the
 * one thing a reader is comparing — price against latency — inside a paragraph. Rows put the
 * numbers in a column you can run your eye down, in mono, right-aligned, which is what makes this
 * section legible at ten models and still legible at forty.
 *
 * Each row is a merge of two sources, and the split is the point. The name, the description and
 * the order come from the CMS, so an operator can write about a model properly. The price, the
 * latency, the vendor and the open model underneath come from the registry — the same file the
 * composer charges against — so a card here cannot advertise a price the product will not honour.
 */

const TASK_ORDER: GenerationTask[] = ['text_to_image', 'image_to_video', 'text_to_video']

export function ModelLibrary({
  section,
  models,
}: {
  section: LandingSection
  models: ModelView[]
}) {
  const groups = TASK_ORDER.map((task) => ({
    task,
    models: models.filter((model) => model.task === task),
  })).filter((group) => group.models.length > 0)

  if (groups.length === 0) return null

  const lead = section.lead
    ? `${models.length} open-weight models. ${section.lead}`
    : `${models.length} open-weight models.`

  return (
    <Section id="models">
      <SectionHeading
        index={section.indexLabel ?? '03'}
        eyebrow={section.eyebrow ?? 'Supported models'}
        title={section.title ?? 'The whole roster, with the real numbers on it'}
        lead={lead}
        action={
          section.ctaLabel && section.ctaHref ? (
            <Button asChild variant="outline">
              <Link href={section.ctaHref}>{section.ctaLabel}</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mt-14 space-y-12">
        {groups.map((group) => (
          <div key={group.task}>
            {/* group rule */}
            <div className="flex items-center gap-4">
              <h3 className="eyebrow text-brand">{TASK_LABELS[group.task]}</h3>
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="eyebrow tabular-nums text-muted-foreground">
                {String(group.models.length).padStart(2, '0')}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {group.models.map((model, index) => (
                <Reveal key={model.id} delay={Math.min(index, 4) * 0.04}>
                  <li className="flex flex-col gap-3 bg-surface/30 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[15px] font-medium">{model.label}</span>
                        {model.isRecommended && (
                          <Badge variant="default" className="text-[10px]">
                            recommended
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{model.basis}</span>
                      </p>

                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {model.description}
                      </p>

                      <p className="mt-1.5 text-xs text-muted-foreground/80">
                        Runs on{' '}
                        {model.providers
                          .map((provider) => provider.replace('huggingface', 'Hugging Face'))
                          .join(' or ')}
                      </p>
                    </div>

                    {/* The numbers column. Fixed width and tabular so the figures line up
                        down the list, which is the whole reason this is rows and not cards. */}
                    <dl className="flex shrink-0 gap-5 sm:gap-8">
                      <div className="min-w-[4.5rem]">
                        <dt className="eyebrow text-muted-foreground">Credits</dt>
                        <dd className="mt-1 text-sm font-medium tabular-nums text-credit">
                          {model.credits}
                        </dd>
                      </div>

                      <div className="min-w-[4.5rem]">
                        <dt className="eyebrow text-muted-foreground">Typical</dt>
                        <dd className="mt-1 text-sm font-medium tabular-nums">
                          ~{model.avgLatencySec}s
                        </dd>
                      </div>

                      <div className="hidden min-w-[5.5rem] sm:block">
                        <dt className="eyebrow text-muted-foreground">Ratios</dt>
                        <dd className="mt-1 text-sm tabular-nums text-muted-foreground">
                          {model.aspectRatios.length}
                        </dd>
                      </div>
                    </dl>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}
