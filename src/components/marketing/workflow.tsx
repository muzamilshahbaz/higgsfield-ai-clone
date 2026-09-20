import { WORKFLOW_STEPS } from '@/lib/marketing/showcase'
import { Reveal } from '@/components/marketing/reveal'

/**
 * Create → Customize → Generate → Export.
 *
 * An offset two-column list: the numbers sit in a sticky rail on the left
 * while the steps scroll past on the right, so the section reads as one
 * continuous process rather than four cards that happen to be numbered.
 *
 * `position: sticky` is the whole effect and needs no JavaScript, no scroll
 * listener and no measurement — and on a narrow screen it simply does not
 * engage, which is the correct mobile behaviour rather than a fallback.
 *
 * Note the section has NO `overflow-hidden`, unlike its neighbours. An
 * ancestor with a clipping overflow becomes the scroll container for any
 * sticky descendant, and a container that never scrolls is one the left
 * column can never stick inside — the effect just silently stops working.
 */
export function Workflow() {
  return (
    <section id="workflow" className="relative scroll-mt-24 border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                The workflow, end to end
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Four steps, one tab. Nothing here asks you to export a file and re-upload it
                somewhere else.
              </p>

              <div className="mt-8 rounded-xl border border-border bg-surface/60 p-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Every generation records the prompt, the resolved prompt, the preset, the
                  model, the seed and the cost — so step four can always become step one again.
                </p>
              </div>
            </Reveal>
          </div>

          <ol className="space-y-px overflow-hidden rounded-2xl border border-border bg-border">
            {WORKFLOW_STEPS.map((item, index) => (
              <li key={item.step}>
                <Reveal delay={index * 0.06}>
                  <div className="flex gap-5 bg-background p-6 transition-colors hover:bg-surface sm:p-8">
                    <span
                      className="font-mono text-sm tabular-nums text-brand"
                      aria-hidden
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {item.step}
                      </p>
                      <h3 className="mt-1 text-lg font-medium">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
