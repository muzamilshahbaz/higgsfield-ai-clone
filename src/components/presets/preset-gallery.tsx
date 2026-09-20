'use client'

import Link from 'next/link'
import { Wand2 } from 'lucide-react'

import { PresetBrowser } from '@/components/presets/preset-browser'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'

/**
 * The full catalogue at /presets.
 *
 * Reads the same context the composer's picker does — the studio layout has
 * already fetched it, so this page costs no query of its own. Tiles are links
 * rather than buttons here: a preset is a destination, and it should survive a
 * middle click.
 */
export function PresetGallery() {
  const { presets } = usePresetCatalogue()

  if (presets.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No presets yet"
        description="The catalogue has not been seeded into this database. Run npm run seed to load the 24 camera moves and 12 film styles."
        action={
          <Button asChild variant="outline">
            <Link href="/create">Compose without a preset</Link>
          </Button>
        }
      />
    )
  }

  return (
    <PresetBrowser
      presets={presets}
      hrefFor={(preset) => `/create?preset=${preset.slug}`}
      columns="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    />
  )
}
