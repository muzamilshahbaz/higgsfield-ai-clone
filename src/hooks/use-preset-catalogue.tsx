'use client'

import * as React from 'react'

import type { PresetSummary } from '@/lib/presets'
import type { PresetKind } from '@/types/database'

/**
 * The preset catalogue, fetched once by the studio layout.
 *
 * Presets are a small, public, rarely-changing table, so every studio surface
 * reads the same server-rendered array instead of querying again: the
 * composer's picker, the gallery and the job cards, which name the preset a
 * shot was made with.
 *
 * Deliberately not a fetcher. The provider is handed data by a Server
 * Component; nothing here goes to the network.
 */

interface PresetCatalogueValue {
  presets: PresetSummary[]
  byId: ReadonlyMap<string, PresetSummary>
  bySlug: ReadonlyMap<string, PresetSummary>
  ofKind: (kind: PresetKind) => PresetSummary[]
}

const EMPTY: PresetCatalogueValue = {
  presets: [],
  byId: new Map(),
  bySlug: new Map(),
  ofKind: () => [],
}

const PresetCatalogueContext = React.createContext<PresetCatalogueValue>(EMPTY)

/**
 * Falls back to an empty catalogue outside the provider rather than throwing.
 * A job card rendered on a surface with no catalogue should simply omit the
 * preset name, not take the page down.
 */
export function usePresetCatalogue(): PresetCatalogueValue {
  return React.useContext(PresetCatalogueContext)
}

export function PresetCatalogueProvider({
  presets,
  children,
}: {
  presets: PresetSummary[]
  children: React.ReactNode
}) {
  const value = React.useMemo<PresetCatalogueValue>(
    () => ({
      presets,
      byId: new Map(presets.map((preset) => [preset.id, preset])),
      bySlug: new Map(presets.map((preset) => [preset.slug, preset])),
      ofKind: (kind) => presets.filter((preset) => preset.kind === kind),
    }),
    [presets],
  )

  return (
    <PresetCatalogueContext.Provider value={value}>{children}</PresetCatalogueContext.Provider>
  )
}
