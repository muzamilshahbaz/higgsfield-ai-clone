import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Explore's loading state.
 *
 * The header, the footer and the hero are real — they do not depend on the
 * query, so rendering placeholders for them would be a worse experience than
 * showing the actual page furniture while only the grid is pending.
 *
 * The `h1` is real too. Without it this page announces itself as headingless
 * for however long the query takes, which a screen reader and an automated
 * audit both notice.
 */
export default function ExploreLoading() {
  return (
    <div className="relative min-h-dvh">
      <SiteHeader />

      <main className="pb-24 pt-28 sm:pt-32">
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="light-wash pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="blueprint blueprint-fade pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
          />

          <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-10 text-center sm:px-6 sm:pb-14 sm:pt-14">
            <p className="eyebrow text-muted-foreground">Community</p>

            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Explore AI creations
            </h1>

            <p role="status" className="sr-only">
              Loading creations…
            </p>

            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Discover public creations shared by the community.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[120rem] space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Skeleton className="mx-auto h-12 w-full max-w-xl rounded-xl" aria-hidden />

          {/* The chip rail, at the widths the real labels take. */}
          <div className="flex gap-2 overflow-hidden" aria-hidden>
            {[96, 104, 88, 86, 104, 84, 96, 112, 92, 88, 104].map((width, index) => (
              <Skeleton
                key={index}
                className="h-9 shrink-0 rounded-full"
                style={{ width: `${width}px`, animationDelay: `${index * 50}ms` }}
              />
            ))}
          </div>

          {/* The masonry, with mixed heights — a grid of identical rectangles
              reads as a placeholder wall rather than as work arriving. */}
          <div
            className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 [&>*]:mb-5"
            aria-hidden
          >
            {[260, 340, 300, 380, 280, 320, 360, 290, 330, 270].map((height, index) => (
              <Skeleton
                key={index}
                className="w-full rounded-xl"
                style={{ height: `${height}px`, animationDelay: `${index * 70}ms` }}
              />
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
