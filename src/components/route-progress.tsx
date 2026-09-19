'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Thin progress bar across the top of the viewport during a navigation.
 *
 * `loading.tsx` only appears once a segment actually suspends, which leaves
 * quick navigations with no feedback at all — the page just sits there for a
 * beat. This fills that gap: it starts the moment an internal link is clicked
 * and finishes when the pathname changes.
 *
 * It listens at the document rather than wrapping every Link, so links added
 * later are covered without anyone remembering to opt in.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearTimers() {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  // Start when an internal link is clicked.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Let the browser handle anything that is not a plain left click.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      if (event.defaultPrevented) return

      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }

      // External links leave the app; hash links do not navigate.
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      start()
    }

    function onPopState() {
      start()
    }

    document.addEventListener('click', onClick, { capture: true })
    window.addEventListener('popstate', onPopState)

    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('popstate', onPopState)
    }
    // `start` is stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function start() {
    clearTimers()
    setVisible(true)
    setProgress(0)

    // Creep toward 90% and wait there: the bar must never claim to be done
    // before the new page is actually ready.
    timers.current.push(setTimeout(() => setProgress(30), 20))
    timers.current.push(setTimeout(() => setProgress(62), 220))
    timers.current.push(setTimeout(() => setProgress(82), 600))
    timers.current.push(setTimeout(() => setProgress(90), 1200))
  }

  // Finish when the route has actually changed.
  useEffect(() => {
    clearTimers()
    setProgress(100)

    const hide = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 260)

    return () => clearTimeout(hide)
  }, [pathname])

  useEffect(() => clearTimers, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease-out' }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)]"
        style={{
          width: `${progress}%`,
          transition: 'width 260ms var(--ease-out-expo)',
        }}
      />
    </div>
  )
}
