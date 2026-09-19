import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { marketingNav, siteConfig } from '@/config/site'

export function SiteHeader({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="glass border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <span className="size-3 rounded-[3px] bg-gradient-to-br from-primary to-accent" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{siteConfig.name}</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {marketingNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.title}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Open studio</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/sign-up">Start creating</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
