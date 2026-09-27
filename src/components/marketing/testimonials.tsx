import { BadgeCheck, Quote, Star } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Section, SectionHeading } from '@/components/marketing/section-heading'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { configBoolean, type LandingSection, type TestimonialItem } from '@/lib/cms/content'

/**
 * Testimonials.
 *
 * The one band that renders nothing by default, and that is the point rather than an oversight.
 * This page's standing rule is that it does not invent social proof: the figures are counted, the
 * model roster is read from the registry, and there are no customer logos because none of them
 * would be real. A CMS that shipped three plausible quotes would have broken that rule on
 * everybody's behalf, so the table seeds empty and the section appears when there is something
 * genuine in it.
 *
 * `isVerified` earns its tick. It records that somebody confirmed the person said this, and the
 * distinction is rendered rather than kept in the admin panel — a reader can tell a checked quote
 * from an unchecked one, which is the only version of a verification badge that means anything.
 *
 * Featured quotes come first, then the operator's order. A rating renders as a number with one
 * star rather than five glyphs: five stars next to every quote is wallpaper, and a reader
 * scanning for a low score will not find it in a row of identical shapes.
 */
export function Testimonials({
  section,
  items,
}: {
  section: LandingSection
  items: TestimonialItem[]
}) {
  if (items.length === 0) return null

  const ordered = [...items].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
    return a.sortOrder - b.sortOrder
  })

  return (
    <Section id="testimonials" tinted={configBoolean(section.config, 'tinted', true)}>
      <SectionHeading
        index={section.indexLabel ?? ''}
        eyebrow={section.eyebrow ?? 'What people say'}
        title={section.title ?? 'From the people using it'}
        lead={section.lead ?? undefined}
      />

      <ul
        className={
          // Two columns rather than three. A quote is read, not scanned, and three columns of
          // body copy on a wide screen gives a measure nobody finishes a sentence in.
          'mt-14 grid gap-4 lg:grid-cols-2'
        }
      >
        {ordered.map((item, index) => (
          <Reveal key={item.id} delay={Math.min(index, 4) * 0.06} className="h-full">
            <figure className="panel flex h-full flex-col rounded-2xl p-6">
              <Quote className="size-5 shrink-0 text-brand/60" aria-hidden />

              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">
                {item.quote}
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-4">
                <Avatar className="size-9 shrink-0">
                  {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[11px]">
                    {item.authorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {item.authorUrl ? (
                      <a
                        href={item.authorUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate hover:text-brand"
                      >
                        {item.authorName}
                      </a>
                    ) : (
                      <span className="truncate">{item.authorName}</span>
                    )}

                    {item.isVerified && (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-brand"
                        aria-label="Verified"
                      />
                    )}
                  </p>

                  {(item.authorRole || item.authorCompany) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.authorRole, item.authorCompany].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>

                {item.rating && (
                  <Badge variant="secondary" className="shrink-0 gap-1 tabular-nums">
                    <Star className="size-3" aria-hidden />
                    {item.rating}
                    <span className="sr-only">out of 5</span>
                  </Badge>
                )}
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
    </Section>
  )
}
