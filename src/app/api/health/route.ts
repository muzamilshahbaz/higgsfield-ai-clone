import { NextResponse } from 'next/server'

import { activeProviderName } from '@/lib/ai'
import { isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/health — is this deployment actually wired up?
 *
 * Reports which capabilities are configured and whether the database answers,
 * and deliberately reports no values: a health check that echoes a project
 * URL or a key prefix is a reconnaissance endpoint. Booleans only.
 *
 * The database probe reads one row from `presets`, which is public under RLS
 * and always seeded — so it proves the connection without needing a session
 * and without touching anything a user owns.
 */
export const dynamic = 'force-dynamic'

interface Health {
  ok: boolean
  status: 'healthy' | 'degraded'
  checks: {
    supabaseConfigured: boolean
    serviceRoleConfigured: boolean
    databaseReachable: boolean
    presetsSeeded: boolean
  }
  provider: string
  timestamp: string
}

export async function GET() {
  let databaseReachable = false
  let presetsSeeded = false

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient()
      const { count, error } = await supabase
        .from('presets')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)

      databaseReachable = !error
      presetsSeeded = (count ?? 0) > 0
    } catch (cause) {
      console.error('[health] database probe failed:', cause)
    }
  }

  const checks = {
    supabaseConfigured: isSupabaseConfigured,
    serviceRoleConfigured: isServiceRoleConfigured,
    databaseReachable,
    presetsSeeded,
  }

  const ok = Object.values(checks).every(Boolean)

  const body: Health = {
    ok,
    status: ok ? 'healthy' : 'degraded',
    checks,
    provider: activeProviderName(),
    timestamp: new Date().toISOString(),
  }

  // 503 when degraded, so an uptime monitor notices without parsing the body.
  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
