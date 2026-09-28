import type { AdminNavIcon } from '@/lib/admin/nav-icons'
import type { Capability } from '@/lib/admin/permissions'
import { canAny } from '@/lib/admin/permissions'
import type { UserRole } from '@/types/database'

/**
 * The admin panel's navigation.
 *
 * One list, one source of truth. The sidebar renders it, the mobile sheet
 * renders it, and the dashboard's quick links render it — so a new screen appears
 * in all three by adding an entry here, and cannot appear in one and be missing
 * from another.
 *
 * `capabilities` is what the item needs to be *visible*, and it is always a READ
 * capability — a read-only admin has a link to every screen they can open, and a
 * screen whose link needed a write grant would be invisible to exactly the role
 * that is supposed to see all of them. It is not the
 * authorization: the page itself calls `requireCapability` and the actions call
 * `authorize`, because hiding a link is a courtesy and a guard is a control.
 * Listing several means "any of these", so a screen with two panels shows up for
 * an operator who can use either one.
 *
 * `icon` is a NAME, resolved through lib/admin/nav-icons.ts. That is not a style choice: the
 * sidebar is a client component, this list is built on the server, and a lucide icon is a
 * forwardRef object that React cannot serialise across that boundary — passing one returns a 500
 * from every admin route. A string is data and crosses fine.
 */

export interface AdminNavItem {
  title: string
  href: string
  icon: AdminNavIcon
  description: string
  capabilities: readonly Capability[]
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/**
 * Grouped by what an operator is doing, not by which table is behind it.
 *
 * Twenty-four flat links is a list you re-read every visit. Six labelled groups
 * is a shape you learn once and then navigate by position — the same reasoning
 * as the studio sidebar in config/site.ts.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Dashboard',
        href: '/admin',
        icon: 'dashboard',
        description: 'Counts, recent activity and anything that needs attention',
        // Everyone who can open the panel can see the dashboard; it is what the
        // guard redirects to when a capability is missing, so it must never be
        // the thing that is missing.
        capabilities: ['content:read', 'users:read', 'moderation:read', 'analytics:read'],
      },
      {
        title: 'Analytics',
        href: '/admin/analytics',
        icon: 'analytics',
        description: 'Generations, signups, spend and revenue over time',
        capabilities: ['analytics:read'],
      },
      {
        title: 'Statistics',
        href: '/admin/statistics',
        icon: 'statistics',
        description: 'The numbers band on the landing page',
        capabilities: ['content:read'],
      },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        title: 'Landing page',
        href: '/admin/landing',
        icon: 'landing',
        description: 'Every band: copy, order, visibility',
        capabilities: ['content:read'],
      },
      {
        title: 'Features',
        href: '/admin/features',
        icon: 'features',
        description: 'Feature cards, capability cards and the overview points',
        capabilities: ['content:read'],
      },
      {
        title: 'FAQ',
        href: '/admin/faq',
        icon: 'faq',
        description: 'Questions and answers',
        capabilities: ['content:read'],
      },
      {
        title: 'Testimonials',
        href: '/admin/testimonials',
        icon: 'testimonials',
        description: 'Quotes, attribution and verification',
        capabilities: ['content:read'],
      },
      {
        title: 'Announcements',
        href: '/admin/announcements',
        icon: 'announcements',
        description: 'Scheduled banners across the marketing site and the studio',
        capabilities: ['content:read'],
      },
      {
        title: 'Categories',
        href: '/admin/categories',
        icon: 'categories',
        description: 'Preset, Explore, model and media vocabularies',
        capabilities: ['content:read'],
      },
      {
        title: 'Media',
        href: '/admin/media',
        icon: 'media',
        description: 'Upload, replace, organise and search every image',
        capabilities: ['media:read'],
      },
    ],
  },
  {
    label: 'Commerce',
    items: [
      {
        title: 'Pricing',
        href: '/admin/pricing',
        icon: 'pricing',
        description: 'What the pricing page says and how the cards are ordered',
        capabilities: ['billing:read'],
      },
      {
        title: 'Plans',
        href: '/admin/plans',
        icon: 'plans',
        description: 'Tier limits, credits and the comparison matrix',
        capabilities: ['billing:read'],
      },
      {
        title: 'Credits',
        href: '/admin/credits',
        icon: 'credits',
        description: 'Signup grant, renewals, bonuses and referrals',
        capabilities: ['billing:read'],
      },
    ],
  },
  {
    label: 'AI',
    items: [
      {
        title: 'Providers',
        href: '/admin/providers',
        icon: 'providers',
        description: 'Vendor catalogue, status and recommendations',
        capabilities: ['providers:read'],
      },
      {
        title: 'Provider keys',
        href: '/admin/providers/keys',
        icon: 'keys',
        description: 'The shared application keys — masked, testable, rotatable',
        capabilities: ['secrets:read'],
      },
      {
        title: 'Models',
        href: '/admin/models',
        icon: 'models',
        description: 'How each model is presented and where it appears',
        capabilities: ['providers:read'],
      },
      {
        title: 'Prompt presets',
        href: '/admin/presets',
        icon: 'presets',
        description: 'The camera-move and style catalogue',
        capabilities: ['content:read'],
      },
    ],
  },
  {
    label: 'Community',
    items: [
      {
        title: 'Users',
        href: '/admin/users',
        icon: 'users',
        description: 'Accounts, roles, credits, status and history',
        capabilities: ['users:read'],
      },
      {
        title: 'Explore',
        href: '/admin/explore',
        icon: 'explore',
        description: 'Moderate published shots and the comments under them',
        capabilities: ['moderation:read'],
      },
      {
        title: 'Assets',
        href: '/admin/assets',
        icon: 'assets',
        description: 'Every generated file, with its job and its owner',
        capabilities: ['moderation:read'],
      },
      {
        title: 'Projects',
        href: '/admin/projects',
        icon: 'projects',
        description: 'Every project, including archived ones',
        capabilities: ['moderation:read'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        title: 'Branding',
        href: '/admin/branding',
        icon: 'branding',
        description: 'Logo, favicon, wordmark',
        capabilities: ['settings:read'],
      },
      {
        title: 'Theme',
        href: '/admin/theme',
        icon: 'theme',
        description: 'Colours, type, radius and motion',
        capabilities: ['settings:read'],
      },
      {
        title: 'Feature flags',
        href: '/admin/flags',
        icon: 'flags',
        description: 'Turn surfaces on and off, including maintenance mode',
        capabilities: ['flags:read'],
      },
      {
        title: 'Settings',
        href: '/admin/settings',
        icon: 'settings',
        description: 'Site, SEO, generation defaults, limits and storage',
        capabilities: ['settings:read'],
      },
      {
        title: 'System logs',
        href: '/admin/logs',
        icon: 'logs',
        description: 'Application events, errors and sign-ins',
        capabilities: ['logs:read'],
      },
      {
        title: 'Audit trail',
        href: '/admin/audit',
        icon: 'audit',
        description: 'Every change an operator has made, and what it was before',
        capabilities: ['logs:read'],
      },
    ],
  },
]

/** The nav, filtered to what this role can see. Empty groups are dropped. */
export function navFor(role: UserRole | null | undefined): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => canAny(role, item.capabilities)),
  })).filter((group) => group.items.length > 0)
}

const FLAT_NAV = ADMIN_NAV.flatMap((group) => group.items)

/**
 * The item a pathname is inside, longest match first.
 *
 * Longest-first matters: `/admin/providers/keys` is under both `/admin` and
 * `/admin/providers`, and the breadcrumb should say Provider keys. Sorting by
 * href length once here is cheaper and less error-prone than an exact-match
 * special case per route.
 */
export function activeNavItem(pathname: string): AdminNavItem | undefined {
  return [...FLAT_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
}
