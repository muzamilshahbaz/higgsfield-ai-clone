import type { NextConfig } from 'next'

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined
  } catch {
    return undefined
  }
})()

/**
 * Response headers applied to every route.
 *
 * Deliberately not a Content-Security-Policy. A real CSP for this app needs a
 * nonce threaded through Next's inline bootstrap scripts, and a broken one
 * either blocks the app or is loose enough to be theatre. These four are the
 * headers that are correct without per-request state.
 */
const SECURITY_HEADERS = [
  // Clickjacking: nothing here is meant to be framed.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops a browser deciding an uploaded file is HTML and running it.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin cross-site, the full path same-site: enough for our own
  // analytics, never enough to leak a generation id to a third party.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app asks for none of these, so it should not be able to.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const nextConfig: NextConfig = {
  // A stack trace in a production response tells an attacker how the server
  // is built and tells the user nothing.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },

  experimental: {
    // Server Actions receive base64 image payloads during remix flows.
    serverActions: { bodySizeLimit: '8mb' },
  },
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
        : []),
      // provider CDNs used before media is copied into our own bucket
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '*.fal.media' },
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: '*.replicate.delivery' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default nextConfig
