import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  FolderOpen,
  Images,
  LayoutDashboard,
  Compass,
  History,
  Settings,
} from 'lucide-react'

export const siteConfig = {
  name: 'Kinetic',
  tagline: 'The cinematic AI studio',
  description:
    'Turn a still frame into cinema. Kinetic wraps state-of-the-art image and video models in one-click camera moves and film styles, so a single photo becomes a shot.',
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
  { title: 'Projects', href: '/projects', icon: FolderOpen, description: 'Organise your work' },
  { title: 'Library', href: '/library', icon: Images, description: 'Every asset you own' },
  { title: 'History', href: '/history', icon: History, description: 'Every job you have run' },
  { title: 'Explore', href: '/explore', icon: Compass, description: 'What the community is making' },
]

export const studioFooterNav: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
]

export const marketingNav = [
  { title: 'Features', href: '#features' },
  { title: 'Presets', href: '#presets' },
  { title: 'How it works', href: '#how-it-works' },
] as const
