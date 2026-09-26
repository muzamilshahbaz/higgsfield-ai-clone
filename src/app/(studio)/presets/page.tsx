import Link from 'next/link'
import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'

import { PresetGallery } from '@/components/presets/preset-gallery'
import { PageHeader } from '@/components/studio/page-header'
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
      <PageHeader
        eyebrow="Workspace"
        title="Presets"
        description={
          <>
            Camera moves and film styles. Each one carries the prompt language, the negative
            prompt and the model settings that make the look land — pick one and the composer
            configures itself.
            {/*
              Said once, here, rather than on thirty-six cards. The thumbnails
              are reference photography chosen to suggest the look; none of them
              was produced by running the preset. A card that implied otherwise
              would be promising a specific result.
            */}
            <span className="mt-2 block text-xs">
              Thumbnails are reference photography, not output from the preset.
            </span>
          </>
        }
        action={
          <Button asChild>
            <Link href="/create">
              <Sparkles className="size-4" />
              Open the composer
            </Link>
          </Button>
        }
      />

      <PresetGallery />
    </div>
  )
}
