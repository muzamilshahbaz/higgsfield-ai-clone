/**
 * Refuses to build while a server is serving `.next`.
 *
 * `next build` rewrites `.next` in place. A `next dev` or `next start` reading
 * that directory at the same time ends up with a half-written chunk manifest,
 * and the symptom is a 500 with `TypeError: a[d] is not a function` from the
 * webpack runtime — which looks like an application bug and is not one. This
 * project has lost time to it twice.
 *
 * Only ever a local guard: CI and Vercel have nothing listening.
 *
 * It checks one port — `PORT`, or 3000 — and cannot see a server that a tool
 * moved to a random port because 3000 was busy. That case still trips the
 * check, because 3000 being busy is what caused the move; a server started
 * directly on an unusual port is the gap. Detecting that portably would mean
 * asking the OS which process holds `.next`, which is not worth the
 * complexity for a guard whose job is catching the usual mistake.
 */
import { createServer } from 'node:net'

const PORT = Number(process.env.PORT ?? 3000)

if (process.env.CI || process.env.VERCEL || process.env.SKIP_PORT_CHECK) {
  process.exit(0)
}

const probe = createServer()

probe.once('error', (error) => {
  if (error.code !== 'EADDRINUSE') process.exit(0)

  console.error(
    `\n  Something is already listening on port ${PORT}.\n\n` +
      `  A running dev or production server shares the .next directory with\n` +
      `  this build. Building now can leave it half-written, and the app then\n` +
      `  500s with a webpack runtime error that looks like a code bug.\n\n` +
      `  Stop the server first, then build again.\n` +
      `  To override: SKIP_PORT_CHECK=1 npm run build\n`,
  )
  process.exit(1)
})

probe.once('listening', () => probe.close(() => process.exit(0)))
probe.listen(PORT, '127.0.0.1')
