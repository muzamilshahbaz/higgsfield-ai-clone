import { AlertTriangle, CheckCircle2, Eye, KeyRound, ShieldCheck } from 'lucide-react'

import {
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { ActionButton, DeleteButton } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { isKeyVaultConfigured } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { getProviderViews } from '@/services/cms/catalogue.service'
import { appKeySources, listAppProviderKeys } from '@/services/cms/provider-keys.service'

import {
  removeProviderKey,
  saveProviderKey,
  saveProviderKeyFor,
  testProviderKey,
} from '../../_actions/catalogue'

/**
 * The shared provider key vault.
 *
 * The most sensitive screen in the panel, and the only one behind `secrets:read` — which
 * only `super_admin` holds. A shared key spends money on somebody else's account, so
 * rotating one is not an editorial action.
 *
 * What this screen deliberately cannot do is show a key. There is no reveal button,
 * because there is nothing to reveal to: `ciphertext` never leaves the server, the masked
 * form is built from a stored prefix and last four rather than from a decryption, and no
 * code path in this application returns a stored vendor credential to a browser. The only
 * way to confirm a key is the one that matters — Test, which asks the vendor.
 *
 * That is a deliberate trade against convenience. An operator who has lost a key cannot
 * recover it here; they mint a new one at the vendor and rotate. The alternative is an
 * endpoint that returns credentials, and that endpoint is how key vaults leak.
 */

const STATUS_META: Record<
  string,
  { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }
> = {
  valid: { label: 'Valid', variant: 'success' },
  invalid: { label: 'Rejected', variant: 'destructive' },
  unreachable: { label: 'Unreachable', variant: 'warning' },
  unverified: { label: 'Unverified', variant: 'secondary' },
}

export default async function AdminProviderKeysPage() {
  await requireCapability('secrets:read', '/admin/providers/keys')

  const [providers, keys, sources] = await Promise.all([
    getProviderViews(),
    listAppProviderKeys(),
    appKeySources(),
  ])

  const stored = new Map(keys.map((key) => [key.provider as string, key]))

  const fields: FieldSpec[] = [
    {
      kind: 'select',
      name: 'provider',
      label: 'Provider',
      options: providers.map((provider) => ({
        value: provider.id,
        label: provider.generationReady ? `${provider.label} — can generate` : provider.label,
      })),
      help: 'Storing a key for a vendor with no driver is allowed: it is verified and held, and nothing routes to it yet.',
    },
    {
      kind: 'text',
      name: 'apiKey',
      label: 'API key',
      required: true,
      mono: true,
      help: 'Sealed with AES-256-GCM before it reaches Postgres. Nothing in this app can show it to you again — only test it.',
    },
    {
      kind: 'text',
      name: 'label',
      label: 'Label',
      maxLength: 48,
      help: 'Which account this key belongs to, for whoever reads this screen next.',
    },
  ]

  const invalid = keys.filter((key) => key.status === 'invalid')

  return (
    <>
      <AdminPageHeader
        eyebrow="AI"
        title="Provider keys"
        description="The shared credentials every user who has not connected their own account generates on."
        actions={
          isKeyVaultConfigured ? (
            <RecordDialog
              title="Store a shared key"
              description="It is verified with the vendor immediately after being saved. If the check cannot complete, the key is still stored — you will not have to paste it again."
              fields={fields}
              initial={{ provider: providers[0]?.id ?? '' }}
              action={saveProviderKey}
              submitLabel="Store and verify"
              successMessage="Key stored."
              resetOnSave
              triggerLabel="Store a key"
            />
          ) : undefined
        }
      />

      {!isKeyVaultConfigured && (
        <AdminPanel title="The vault is not configured">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Storing a key needs both <code className="font-mono">AI_KEY_ENCRYPTION_SECRET</code> and{' '}
            <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in the environment. Without
            the first there is nothing to seal a key with, and an unsealed credential is not going in
            a database.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Generations still work: the routing chain falls through to the per-vendor environment
            variables, which is how this deployment ran before this screen existed.
          </p>
        </AdminPanel>
      )}

      <AdminPanel
        title="Why there is no reveal button"
        description="This is the one screen where the missing feature is the point."
      >
        <ul className="max-w-3xl space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              A key is sealed with AES-256-GCM in the application before it reaches Postgres. A
              database dump leaks ciphertext and nothing else.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              The masked form — <code className="font-mono">sk-••••••••1234</code> — is built from a
              stored prefix and last four, never from a decryption. No display path decrypts anything.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              The only code that decrypts takes a job it has already authorised and hands the key
              straight to the provider driver. There is no endpoint that returns one, which is the
              only reliable way to be sure one cannot leak.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              So confirming a key means <strong className="text-foreground">Test</strong>, which asks
              the vendor whether it works. That answers the useful question; reading the characters
              back does not.
            </span>
          </li>
        </ul>
      </AdminPanel>

      <AdminPanel
        title="Stored keys"
        description="Database first, environment second. A vendor showing “Environment” has a key that cannot be rotated from here."
        footer="Rotating replaces the ciphertext outright — the previous value is not kept, because a rotated key should stop existing rather than becoming a second copy of a secret."
      >
        <AdminTable
          head={
            <>
              <Th>Provider</Th>
              <Th className="w-44">Key</Th>
              <Th className="w-32">Last check</Th>
              <Th className="w-32">Source</Th>
              <Th className="w-56" />
            </>
          }
        >
          {providers.map((provider) => {
            const key = stored.get(provider.id)
            const source = sources[provider.id] ?? 'none'
            const status = key ? STATUS_META[key.status] : null

            return (
              <tr key={provider.id}>
                <Td>
                  <p className="flex items-center gap-2 font-medium">
                    {provider.label}
                    {!provider.generationReady && (
                      <Badge variant="secondary" className="text-[10px]">
                        no driver
                      </Badge>
                    )}
                  </p>
                  {key?.label && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{key.label}</p>
                  )}
                  {key?.lastError && (
                    <p className="mt-1 max-w-[24rem] text-xs leading-relaxed text-danger">
                      {key.lastError}
                    </p>
                  )}
                </Td>

                <Td>
                  {key ? (
                    <code className="font-mono text-xs">{key.masked}</code>
                  ) : (
                    <span className="text-xs text-muted-foreground">none stored</span>
                  )}
                </Td>

                <Td>
                  {key && status ? (
                    <div className="space-y-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {key.lastVerifiedAt && (
                        <p className="text-[11px] text-muted-foreground">
                          <RelativeTime value={key.lastVerifiedAt} />
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>

                <Td>
                  <Badge
                    variant={
                      source === 'database' ? 'success' : source === 'environment' ? 'secondary' : 'warning'
                    }
                  >
                    {source === 'database'
                      ? 'Stored here'
                      : source === 'environment'
                        ? 'Environment'
                        : 'None'}
                  </Badge>
                </Td>

                <Td>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {key && (
                      <ActionButton
                        action={testProviderKey.bind(null, provider.id)}
                        successMessage="Checked with the vendor."
                        icon="check"
                      >
                        Test
                      </ActionButton>
                    )}

                    {isKeyVaultConfigured && (
                      <RecordDialog
                        title={key ? `Rotate the ${provider.label} key` : `Store a ${provider.label} key`}
                        description={
                          key
                            ? 'The old ciphertext is replaced outright. Nothing keeps a copy of the key you are replacing.'
                            : 'Sealed before it reaches the database, and verified with the vendor immediately after.'
                        }
                        fields={fields.filter((field) => field.name !== 'provider')}
                        initial={{ label: key?.label ?? '' }}
                        action={saveProviderKeyFor.bind(null, provider.id)}
                        submitLabel={key ? 'Rotate' : 'Store and verify'}
                        successMessage={key ? 'Rotated.' : 'Stored.'}
                        trigger={
                          <button
                            type="button"
                            className="inline-flex h-8 items-center rounded-lg border border-border bg-surface/40 px-3 text-xs font-medium transition-colors hover:border-muted"
                          >
                            {key ? 'Rotate' : 'Store'}
                          </button>
                        }
                      />
                    )}

                    {key && (
                      <DeleteButton
                        action={removeProviderKey.bind(null, provider.id)}
                        what={`the shared ${provider.label} key`}
                        label="Remove"
                        successMessage="Removed."
                        description={
                          sources[provider.id] === 'database' &&
                          !providers.find((entry) => entry.id === provider.id)?.generationReady ? (
                            <>Nothing routes to this vendor yet, so removing the key changes nothing operationally.</>
                          ) : (
                            <>
                              Every user without their own {provider.label} key will fall back to the
                              environment variable, if one is set — and be refused if it is not.
                            </>
                          )
                        }
                        iconOnly
                      />
                    )}
                  </div>
                </Td>
              </tr>
            )
          })}
        </AdminTable>
      </AdminPanel>

      {invalid.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>
            {invalid.length} stored key{invalid.length === 1 ? ' was' : 's were'} rejected by the
            vendor. A key marked rejected is skipped by the router rather than used — a credential the
            vendor has already refused is not worth a failed job and a refund. Rotate it, or remove it
            so the environment variable takes over.
          </span>
        </p>
      )}
    </>
  )
}
