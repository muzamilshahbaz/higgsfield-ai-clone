'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Copies a shot's public link.
 *
 * The origin comes from the browser rather than from `NEXT_PUBLIC_SITE_URL`,
 * so a link copied from a preview deployment points at that deployment instead
 * of at production.
 *
 * `navigator.clipboard` is unavailable over plain HTTP and can be refused by
 * permission policy, so the failure path shows the URL rather than pretending
 * something was copied.
 *
 * `share` is tried first where the browser offers it, because on a phone the
 * useful thing to do with a shot is send it to someone, not put it on a
 * clipboard the reader then has to find somewhere to paste.
 */
export function ShareButton({
  generationId,
  title,
  variant = 'outline',
  className,
}: {
  generationId: string
  /** Offered as the share sheet's subject where the browser supports one. */
  title?: string
  /** `chip` is the compact form used in the feed's hover rail. */
  variant?: 'outline' | 'ghost' | 'chip'
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function share() {
    const url = `${window.location.origin}/g/${generationId}`

    // A share sheet that the reader dismisses rejects with AbortError. That is
    // not a failure worth falling back from — they chose not to share — so it
    // is swallowed and nothing is claimed.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ url, title: title ?? 'A shot made with Kinetic' })
        return
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      toast.message('Copy this link', { description: url, duration: 10000 })
    }
  }

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Copy a link to this shot"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground',
          className,
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Link2 className="size-3.5" aria-hidden />
        )}
        {copied ? 'Copied' : 'Share'}
      </button>
    )
  }

  return (
    <Button variant={variant} onClick={() => void share()} className={className}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}
