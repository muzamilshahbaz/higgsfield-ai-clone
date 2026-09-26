import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  FolderOpen,
  Images,
  LayoutDashboard,
  Compass,
  History,
  Settings,
  Wand2,
} from 'lucide-react'

export const siteConfig = {
  name: 'Kinetic Studio',
  /** For the places that genuinely cannot fit two words: a 40px sidebar rail. */
  shortName: 'Kinetic',
  tagline: 'The AI creative workspace',
  description:
    'Kinetic Studio is a workspace for making images and video with open models. One composer, one credit balance, your own API keys — from a prompt to a finished shot without leaving the page.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
} as const

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description?: string
}

export const studioNav: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Your studio at a glance',
  },
  {
    title: 'Create',
    href: '/create',
    icon: Clapperboard,
    description: 'Compose a new generation',
  },
  {
    title: 'Presets',
    href: '/presets',
    icon: Wand2,
    description: 'Camera moves and film styles',
  },
  { title: 'Projects', href: '/projects', icon: FolderOpen, description: 'Organise your work' },
  { title: 'Library', href: '/library', icon: Images, description: 'Every asset you own' },
  { title: 'History', href: '/history', icon: History, description: 'Every job you have run' },
  { title: 'Explore', href: '/explore', icon: Compass, description: 'What the community is making' },
]

/**
 * The sidebar, grouped.
 *
 * Seven flat links is a list you read every time; three labelled groups is a
 * shape you learn once and then navigate by position. The grouping is by what
 * you are doing — making something, managing what you made, looking at what
 * other people made — not by how often a link is clicked.
 *
 * `studioNav` above stays the flat source of truth so nothing can appear in a
 * group without existing as a route; this only arranges it.
 */
export interface NavGroup {
  label: string
  items: NavItem[]
}

function navItem(href: string): NavItem {
  const item = studioNav.find((entry) => entry.href === href)
  if (!item) throw new Error(`No studio nav item for ${href}`)
  return item
}

export const studioNavGroups: NavGroup[] = [
  { label: 'Workspace', items: ['/dashboard', '/create', '/presets'].map(navItem) },
  { label: 'Content', items: ['/projects', '/library', '/history'].map(navItem) },
  { label: 'Community', items: ['/explore'].map(navItem) },
]

export const studioFooterNav: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
]

/**
 * Landing-page nav.
 *
 * Every href is an id that a section on / actually renders. Adding an entry
 * without the matching `id` gives a link that scrolls nowhere, which is worse
 * than not linking to the section at all.
 */
export const marketingNav = [
  { title: 'Product', href: '#overview' },
  { title: 'Models', href: '#models' },
  { title: 'How it works', href: '#workflow' },
  { title: 'Pricing', href: '#pricing' },
  { title: 'FAQ', href: '#faq' },
] as const
