'use client'

import { Coins, Timer } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { modelsForTask, type ModelEntry } from '@/lib/ai/registry'
import type { GenerationTask } from '@/types/database'

/**
 * Model picker for the current task.
 *
 * The list comes from lib/ai/registry.ts, so a new model appears here — with
 * its cost and its capabilities — without this file changing.
 */
export function ModelSelector({
  task,
  value,
  onChange,
}: {
  task: GenerationTask
  value: string
  onChange: (modelId: string) => void
}) {
  const models = modelsForTask(task)
  const selected = models.find((model) => model.id === value)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground" id="model-label">
          Model
        </span>
        {selected && <ModelMeta model={selected} />}
      </div>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby="model-label">
          {/*
            The label is passed as a child rather than left to Radix to infer.
            Radix reads it from the matching item, which does not exist during
            SSR — so the server would render an empty box that only fills in
            after hydration.
          */}
          <SelectValue placeholder="Pick a model">{selected?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id} hint={model.blurb}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * The price and the wait, beside the label.
 *
 * Credits are in the credit colour and latency is muted: they are two different
 * kinds of cost and only one of them comes out of a balance.
 */
function ModelMeta({ model }: { model: ModelEntry }) {
  return (
    <span className="flex shrink-0 items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1 tabular-nums text-credit">
        <Coins className="size-3" aria-hidden />
        {model.credits}
        <span className="sr-only"> {model.credits === 1 ? 'credit' : 'credits'}</span>
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
        <Timer className="size-3" aria-hidden />
        <span className="sr-only">about </span>~{model.avgLatencySec}s
      </span>
    </span>
  )
}
