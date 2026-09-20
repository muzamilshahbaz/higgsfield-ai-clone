'use client'

import * as React from 'react'
import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'

/**
 * Scroll reveal for the marketing page.
 *
 * `LazyMotion` with the `domAnimation` feature set rather than the full
 * `motion` bundle: this is decoration on the one route a first-time visitor
 * loads, and the difference is most of the library's weight for animations
 * that are two properties deep.
 *
 * `useReducedMotion` is not optional here. A page that fades six sections in
 * on scroll is exactly what someone with a vestibular disorder turned the
 * setting off for, so the content renders in place instead.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className={className}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        // `once` matters: re-animating on every scroll past turns a polished
        // page into a flickering one.
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </m.div>
    </LazyMotion>
  )
}
