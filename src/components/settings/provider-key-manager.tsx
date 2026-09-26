'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react'

import {
  deleteProviderKeyAction,
  saveProviderKeyAction,
  testProviderKeyAction,
} from '@/app/(studio)/settings/keys/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RelativeTime } from '@/components/ui/relative-time'
import { keyShapeWarning, PROVIDERS, type ProviderDescriptor } from '@/lib/ai/catalogue'
import { LABEL_MAX, saveProviderKeySchema } from '@/lib/validation/ai-key'
import { cn } from '@/lib/utils'
import type { ProviderConnection } from '@/services/ai-keys.service'
import type { ProviderKeyStatus } from '@/types/database'

/**
 * The AI model keys tab.
 *
 * Renders entirely from `PROVIDERS` in lib/ai/catalogue.ts. There is no
 * `if (provider === 'kling')` anywhere in this file and there should never be
 * one: a new vendor is a catalogue entry plus a driver, and this component
 * picks it up without being touched.
 *
 * Connection state is held locally and seeded from the server. Each action also
 * revalidates `/settings/keys`, so the optimistic list and the server render
 * converge — the local copy exists so a "Test" does not blank the whole page
 * while it waits on someone else's API.
 *
 * Laid out as a card grid split into two groups: the providers that can run a
 * generation today, and the ones whose key can only be stored and verified.
 * That split used to be a badge on a row in a single list, which put the three
 * vendors that actually matter in amongst eight that do not — a visitor with a
 * fal.ai account had to read every card to find theirs.
 */

const STATUS_META: Record<
  ProviderKeyStatus,
  {
    label: string
    variant: 'success' | 'destructive' | 'warning' | 'secondary'
    icon: typeof CheckCircle2
    /** The dot beside the masked key. Colour only, so it is `aria-hidden`. */
    dot: string
  }
> = {
  valid: { label: 'Connected', variant: 'success', icon: CheckCircle2, dot: 'bg-success' },
  invalid: { label: 'Rejected', variant: 'destructive', icon: XCircle, dot: 'bg-destructive' },
  unreachable: { label: 'Unchecked', variant: 'warning', icon: AlertTriangle, dot: 'bg-warning' },
  unverified: { label: 'Stored', variant: 'secondary', icon: HelpCircle, dot: 'bg-muted-foreground' },
}

/**
 * What each provider makes. Spelled out rather than capitalised from the id —
 * `capitalize` on "both" turned into "Image And Video", with a capital A.
 */
const MEDIA_LABELS: Record<ProviderDescriptor['media'], string> = {
  image: 'Image',
  video: 'Video',
  both: 'Image and video',
}

export function ProviderKeyManager({
  connections: initial,
  vaultReady,
}: {
  connections: ProviderConnection[]
  vaultReady: boolean
}) {
  const [connections, setConnections] = React.useState(initial)
  const [editing, setEditing] = React.useState<ProviderDescriptor | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  // The server is the source of truth: a revalidation that brings back a
  // different list must win over whatever this component last stored.
  React.useEffect(() => setConnections(initial), [initial])

  const byProvider = React.useMemo(
    () => new Map(connections.map((connection) => [connection.provider, connection])),
    [connections],
  )

  function upsert(next: ProviderConnection) {
    setConnections((current) => {
      const rest = current.filter((entry) => entry.provider !== next.provider)
      return [...rest, next]
    })
  }

  async function test(provider: ProviderDescriptor) {
    setBusy(provider.id)
    const result = await testProviderKeyAction({ provider: provider.id })
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    upsert(result.data)
    const meta = STATUS_META[result.data.status]
    if (result.data.status === 'valid') toast.success(`${provider.label}: ${meta.label.toLowerCase()}`)
    else toast.warning(result.data.lastError ?? meta.label)
  }

  async function remove(provider: ProviderDescriptor) {
    setBusy(provider.id)
    const result = await deleteProviderKeyAction({ provider: provider.id })
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setConnections((current) => current.filter((entry) => entry.provider !== provider.id))
    toast.success(`Disconnected ${provider.label}`)
  }

  const connectedCount = connections.length
  const ready = PROVIDERS.filter((provider) => provider.generationReady)
  const storeOnly = PROVIDERS.filter((provider) => !provider.generationReady)

  const groups = [
    {
      key: 'ready',
      title: 'Runs generations',
      hint: 'Connect one of these and your jobs run on your own account and quota.',
      providers: ready,
    },
    {
      key: 'store-only',
      title: 'Store and verify only',
      hint: 'The key is encrypted and checked against the vendor, but no model routes here yet.',
      providers: storeOnly,
    },
  ]

  return (
    <div className="space-y-8">
      {!vaultReady && (
        <Card className="border-warning/40 bg-warning/5 p-4" role="status">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Key storage is not configured</p>
              <p className="mt-1 text-muted-foreground">
                Set <code className="font-mono text-xs">AI_KEY_ENCRYPTION_SECRET</code> and{' '}
                <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>, then run
                migration <code className="font-mono text-xs">0007_provider_keys.sql</code>. Until
                then you can read this list but not connect anything.
              </p>
            </div>
          </div>
        </Card>
      )}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`providers-${group.key}`}>
          <div className="flex items-center gap-4">
            <h3 id={`providers-${group.key}`} className="eyebrow text-muted-foreground">
              {group.title}
            </h3>
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="eyebrow tabular-nums text-muted-foreground">
              {group.providers.filter((provider) => byProvider.has(provider.id)).length}/
              {group.providers.length}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{group.hint}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {group.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                connection={byProvider.get(provider.id) ?? null}
                busy={busy === provider.id}
                disabled={!vaultReady}
                onConnect={() => setEditing(provider)}
                onTest={() => test(provider)}
                onRemove={() => remove(provider)}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        {connectedCount === 0
          ? `${PROVIDERS.length} providers available. Nothing connected yet.`
          : `${connectedCount} of ${PROVIDERS.length} providers connected.`}
      </p>

      <KeyDialog
        provider={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(connection) => {
          upsert(connection)
          setEditing(null)
        }}
      />
    </div>
  )
}

/**
 * One provider.
 *
 * A connected card is marked by a cyan top edge and its status badge, so the
 * ones you have set up are findable at a glance in a grid of eleven.
 *
 * The masked key is the only thing here that could be mistaken for a secret, so
 * it is presented as what it is: four real characters after a run of dots, in
 * mono, with a title explaining that the rest was never stored in the clear.
 */
function ProviderCard({
  provider,
  connection,
  busy,
  disabled,
  onConnect,
  onTest,
  onRemove,
}: {
  provider: ProviderDescriptor
  connection: ProviderConnection | null
  busy: boolean
  disabled: boolean
  onConnect: () => void
  onTest: () => void
  onRemove: () => void
}) {
  const meta = connection ? STATUS_META[connection.status] : null
  const StatusIcon = meta?.icon
  const MediaIcon = provider.media === 'image' ? ImageIcon : provider.media === 'video' ? Video : Plug

  return (
    <Card className={cn('relative flex h-full flex-col p-5', connection && 'border-brand/30')}>
      {connection && (
        <span className="absolute inset-x-0 top-0 z-10 h-[2px] bg-primary/70" aria-hidden />
      )}

      <div className="flex items-start gap-3">
        <span className="chip-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
          <MediaIcon className="size-[18px]" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-display text-[15px] font-medium">{provider.label}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{MEDIA_LABELS[provider.media]}</p>
        </div>

        {meta && StatusIcon && (
          <Badge variant={meta.variant} className="shrink-0">
            <StatusIcon className="size-3" aria-hidden />
            {meta.label}
          </Badge>
        )}
      </div>

      <p className="mt-4 flex-1 text-xs leading-relaxed text-muted-foreground">{provider.blurb}</p>

      {connection ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <span className={cn('size-1.5 shrink-0 rounded-full', meta?.dot)} aria-hidden />
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
              title="Only the last four characters are stored in the clear"
            >
              {connection.masked}
            </p>
          </div>

          {connection.label && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{connection.label}</p>
          )}

          {connection.status === 'valid' && connection.lastVerifiedAt ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Verified <RelativeTime value={connection.lastVerifiedAt} />
            </p>
          ) : (
            connection.lastError && (
              <p className="mt-1.5 text-xs leading-snug text-warning">{connection.lastError}</p>
            )
          )}
        </div>
      ) : (
        <p className="mt-4 truncate rounded-lg border border-dashed border-border px-3 py-2.5 font-mono text-xs text-muted-foreground/70">
          {provider.keyPlaceholder}
        </p>
      )}

      <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-4">
        {connection ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={busy || disabled}
              onClick={onTest}
              aria-label={`Test the ${provider.label} key`}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={busy || disabled}
              onClick={onConnect}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy || disabled}
              onClick={onRemove}
              aria-label={`Remove the ${provider.label} key`}
            >
              <Trash2 className="size-3.5 text-danger" aria-hidden />
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" className="flex-1" disabled={disabled} onClick={onConnect}>
              Connect
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={provider.consoleUrl} target="_blank" rel="noreferrer noopener">
                Get a key
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * The add/replace dialog.
 *
 * `type="password"` with no reveal toggle. A reveal would have to hold the
 * plaintext in a rendered DOM node, and the value here is only ever in flight
 * — once saved, nothing in the app can show it again, so a toggle would be a
 * reveal for exactly the seconds it is least useful and most exposed.
 */
function KeyDialog({
  provider,
  onOpenChange,
  onSaved,
}: {
  provider: ProviderDescriptor | null
  onOpenChange: (open: boolean) => void
  onSaved: (connection: ProviderConnection) => void
}) {
  const [apiKey, setApiKey] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Never carry one vendor's typed key into another vendor's dialog.
  React.useEffect(() => {
    setApiKey('')
    setLabel('')
    setError(null)
  }, [provider])

  const warning = provider && apiKey.trim() ? keyShapeWarning(provider, apiKey) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!provider || saving) return

    const parsed = saveProviderKeySchema.safeParse({ provider: provider.id, apiKey, label })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the key.')
      return
    }

    setError(null)
    setSaving(true)
    const result = await saveProviderKeyAction({
      provider: provider.id,
      apiKey: parsed.data.apiKey,
      label: parsed.data.label || undefined,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    // Cleared before the dialog closes, not after: a closing animation that
    // still has the key in an input is a key on screen for 200ms too long.
    setApiKey('')
    setLabel('')
    onSaved(result.data)

    if (result.data.status === 'valid') toast.success(`${provider.label} connected`)
    else if (result.data.status === 'invalid') toast.error(result.data.lastError ?? 'That key was rejected.')
    else toast.warning(result.data.lastError ?? 'Saved, but not verified.')
  }

  return (
    <Dialog open={Boolean(provider)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Connect {provider?.label}</DialogTitle>
            <DialogDescription>
              The key is encrypted before it is stored and is never sent back to the browser. You
              will only ever see the last four characters again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="api-key">API key</Label>
              <Input
                id="api-key"
                type="password"
                className="font-mono"
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={provider?.keyPlaceholder}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'api-key-error' : 'api-key-hint'}
                onChange={(event) => setApiKey(event.target.value)}
              />
              {error ? (
                <p id="api-key-error" role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : (
                <p
                  id="api-key-hint"
                  className={cn('text-xs', warning ? 'text-warning' : 'text-muted-foreground')}
                >
                  {warning ?? 'Pasted keys are trimmed, so a trailing newline is fine.'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-label">Label (optional)</Label>
              <Input
                id="key-label"
                value={label}
                maxLength={LABEL_MAX}
                placeholder="Personal account"
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || apiKey.trim().length === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? 'Verifying' : 'Save and test'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
