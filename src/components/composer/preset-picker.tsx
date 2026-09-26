'use client'

import * as React from 'react'
import { ChevronRight, Wand2, X } from 'lucide-react'

import { PresetBrowser } from '@/components/presets/preset-browser'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { getModel } from '@/lib/ai/registry'
import { formatCategory, PRESET_KIND_LABELS, type PresetSummary } from '@/lib/presets'
import type { GenerationTask } from '@/types/database'

/**
 * Preset chooser for the composer.
 *
 * The catalogue is already in context from the studio layout, so opening the
 * browser costs nothing. Choosing a preset is what sets the model — a motion
 * preset is authored against a video model and a style preset against an image
 * model — and the composer moves the whole form to match.
 */
export function PresetPicker({
  task,
  value,
  onChange,
  disabled = false,
}: {
  /** Used only to decide which kind the browser opens on. */
  task: GenerationTask
  value: PresetSummary | null
  onChange: (preset: PresetSummary | null) => void
  disabled?: boolean
}) {
  const { presets } = usePresetCatalogue()
  const [open, setOpen] = React.useState(false)

  const model = value ? getModel(value.modelId) : undefined

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">Preset</span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
            Clear
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-label={value ? `Preset: ${value.title}. Choose a different one` : 'Browse presets'}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg border border-input bg-surface/50 p-2 text-left transition-colors hover:border-brand/50 hover:bg-surface-2/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {value?.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.posterUrl}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover ring-1 ring-border"
          />
        ) : (
          <span className="chip-brand flex size-10 shrink-0 items-center justify-center rounded-md">
            <Wand2 className="size-4" aria-hidden />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {value ? value.title : 'Browse presets'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {value
              ? `${PRESET_KIND_LABELS[value.kind]} · ${formatCategory(value.category)} · ${model?.label ?? value.modelId}`
              : `${presets.length} camera moves and film styles`}
          </span>
        </span>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {value?.description && (
        <p className="text-xs leading-snug text-muted-foreground">{value.description}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Presets</DialogTitle>
            <DialogDescription>
              A preset adds its own prompt language and model settings, and picks the model it was
              built for.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {presets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                The preset catalogue is empty. Run{' '}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">npm run seed</code> to
                load it.
              </p>
            ) : (
              <PresetBrowser
                presets={presets}
                // Inside a dialog whose title is the h2 above it.
                emptyHeadingLevel={3}
                selectedId={value?.id ?? null}
                initialKind={task === 'text_to_image' ? 'style' : 'motion'}
                columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                onSelect={(preset) => {
                  onChange(preset.id === value?.id ? null : preset)
                  setOpen(false)
                }}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-5 py-3.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!value}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              No preset
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
