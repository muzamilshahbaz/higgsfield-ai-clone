import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'

import { ProviderKeyManager } from '@/components/settings/provider-key-manager'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import { Card } from '@/components/ui/card'
import { isKeyVaultConfigured } from '@/lib/env'
import { routingSummary } from '@/services/ai/ai-router'
import { listMyConnections } from '@/services/ai-keys.service'

export const metadata: Metadata = {
  title: 'AI model keys',
  description: 'Connect your own provider accounts and run generations on your own quota.',
}

/**
 * The AI model keys tab.
 *
 * `listMyConnections` returns masked metadata — provider, prefix, last four,
 * status — and nothing else. No ciphertext and no plaintext crosses into the
 * client component below, which is why this page can stay a plain Server
 * Component with no special handling.
 */
export default async function ProviderKeysPage() {
  const connections = await listMyConnections()
  const routing = routingSummary()

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your profile and your credit ledger.</p>
      </div>

      <SettingsTabs />

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">AI model keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a provider account to run generations on your own quota instead of the shared
            one. Keys are encrypted at rest and never returned to the browser.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">A key here is what runs a generation</p>
              <p className="mt-1 text-muted-foreground">
                Generations run on{' '}
                <span className="font-medium text-foreground">
                  {routing.generationProviderLabels.join(', ')}
                </span>
                . Your own key is always preferred; without one, a job falls back to this
                deployment&apos;s shared key, and with neither it is refused with a message rather
                than quietly faked. Every other provider below can be stored and verified, but no
                model routes to it yet.
              </p>
            </div>
          </div>
        </Card>

        <ProviderKeyManager connections={connections} vaultReady={isKeyVaultConfigured} />
      </div>
    </div>
  )
}
