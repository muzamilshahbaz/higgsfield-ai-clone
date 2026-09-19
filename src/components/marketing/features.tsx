import { Film, Layers, Sparkles, Wand2, Zap, FolderOpen } from 'lucide-react'

const FEATURES = [
  {
    icon: Film,
    title: 'Camera moves, one click',
    body: 'Crash zooms, dolly zooms, orbits and drone pulls — each preset carries the prompt language and model parameters that make the move read on screen.',
  },
  {
    icon: Wand2,
    title: 'Image and video in one composer',
    body: 'Generate a frame from text, then send it straight into a motion preset. No exporting, no re-uploading, no second tool.',
  },
  {
    icon: Zap,
    title: 'Live job feed',
    body: 'Queue as many shots as you like. Cards stream from queued to rendering to playing without a single refresh.',
  },
  {
    icon: Layers,
    title: 'Swappable model layer',
    body: 'Every preset points at a model registry, not a vendor. When a better model ships, the whole catalog moves with one line.',
  },
  {
    icon: FolderOpen,
    title: 'Projects and asset library',
    body: 'Shots land in projects, assets stay downloadable, and every generation keeps the prompt, preset and seed that produced it.',
  },
  {
    icon: Sparkles,
    title: 'Remix anything',
    body: 'See a shot in Explore you like? Remix pulls its preset and parameters into your composer so you can make it yours.',
  },
]

const STEPS = [
  { step: '01', title: 'Pick a preset', body: 'Browse camera moves and film styles. Hover to see the motion.' },
  { step: '02', title: 'Add your frame', body: 'Upload a photo or generate one from a prompt in the same composer.' },
  { step: '03', title: 'Generate', body: 'Watch it render live, then publish, download or remix it.' },
]

export function Features() {
  return (
    <>
      <section id="features" className="relative border-t border-border/60 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A studio, not a prompt box
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              The model is the easy part. Everything around it — the presets, the queue, the
              library, the credits — is what turns a demo into a tool you actually use.
            </p>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-background p-7 transition-colors hover:bg-surface"
              >
                <feature.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-[15px] font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative border-t border-border/60 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps to a shot
          </h2>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {STEPS.map((item) => (
              <div key={item.step} className="relative">
                <span className="font-mono text-sm text-primary">{item.step}</span>
                <h3 className="mt-3 text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
