import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Features } from '@/components/marketing/features'
import { Hero } from '@/components/marketing/hero'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'

export default async function LandingPage() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null
  const isSignedIn = Boolean(user)

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={isSignedIn} />

      <main>
        <Hero isSignedIn={isSignedIn} />
        <Features />

        <section className="relative overflow-hidden border-t border-border/60 py-24">
          <div className="aurora opacity-60" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Your first shot is 200 credits away
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
              Sign up, pick a camera move, and watch a still frame start moving.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href={isSignedIn ? '/create' : '/sign-up'}>
                {isSignedIn ? 'Open the composer' : 'Create your account'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
