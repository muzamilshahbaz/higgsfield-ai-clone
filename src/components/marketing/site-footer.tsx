import Link from 'next/link'

import { siteConfig } from '@/config/site'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:px-6 md:flex-row lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <span className="size-2.5 rounded-[3px] bg-gradient-to-br from-primary to-accent" />
          </span>
          <span className="text-sm font-medium">{siteConfig.name}</span>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          An independent portfolio project. Not affiliated with any commercial AI video service.
        </p>

        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <Link href="/explore" className="transition-colors hover:text-foreground">
            Explore
          </Link>
          <Link href="/sign-in" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  )
}
