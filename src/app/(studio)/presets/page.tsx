import Link from 'next/link'
import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'

import { PresetGallery } from '@/components/presets/preset-gallery'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Presets',
  description: 'Camera moves and film styles, each one a prompt and a model that already agree.',
}

/**
 * The catalogue.
 *
 * The page itself is a Server Component with nothing to fetch: the studio
 * layout already read the catalogue and put it in context, so this is a
 * heading and a client-side browser over data that is already on the page.
 */
export default function PresetsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presets</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Camera moves and film styles. Each one carries the prompt language, the negative
            prompt and the model settings that make the look land — pick one and the composer
            configures itself.
          </p>
          {/*
            Said once, here, rather than on thirty-six cards. The thumbnails are
            reference photography chosen to suggest the look; none of them was
            produced by running the preset. A card that implied otherwise would
            be promising a specific result.
          */}
          <p className="mt-2 max-w-xl text-xs text-muted-foreground">
            Thumbnails are reference photography, not output from the preset.
          </p>
        </div>

        <Button asChild>
          <Link href="/create">
            <Sparkles className="size-4" />
            Open the composer
          </Link>
        </Button>
      </div>

      <PresetGallery />
    </div>
  )
}
