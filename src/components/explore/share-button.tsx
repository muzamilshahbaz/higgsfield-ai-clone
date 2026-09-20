'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

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
 */
export function ShareButton({
  generationId,
  variant = 'outline',
  className,
}: {
  generationId: string
  variant?: 'outline' | 'ghost'
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    const url = `${window.location.origin}/g/${generationId}`

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      toast.message('Copy this link', { description: url, duration: 10000 })
    }
  }

  return (
    <Button variant={variant} onClick={() => void copy()} className={className}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}
