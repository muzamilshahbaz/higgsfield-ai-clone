import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BadgeCheck,
  Bell,
  Boxes,
  ChartLine,
  CircleHelp,
  Compass,
  CreditCard,
  FileText,
  FolderOpen,
  Gauge,
  Image,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListTree,
  MessageSquareQuote,
  Palette,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  ToggleLeft,
  Users,
  Wand2,
} from 'lucide-react'

/**
 * The admin navigation's icons, resolved from a name.
 *
 * Split out from nav.ts for a reason that cost a 500 before it was found: the sidebar is a client
 * component, `navFor(role)` runs on the server, and a lucide icon is a `forwardRef` object. React
 * cannot serialise a component across that boundary — it throws "Functions cannot be passed
 * directly to Client Components", and every admin route returns a 500.
 *
 * So `AdminNavItem.icon` is a string and this is the only place that turns one into a component.
 * Both sides import it: the client sidebar to render the rail, the dashboard to render its quick
 * links. What crosses the boundary is a name, which is data.
 *
 * The same shape as lib/admin/icons.ts and for a related reason — a name resolved through a map is
 * safe where `LucideIcons[name]` is an import by name from a variable — but a separate map, because
 * that one is the vocabulary an editor may choose from and this one is the app's own furniture.
 */
export type AdminNavIcon =
  | 'dashboard'
  | 'analytics'
  | 'statistics'
  | 'landing'
  | 'features'
  | 'faq'
  | 'testimonials'
  | 'announcements'
  | 'categories'
  | 'media'
  | 'pricing'
  | 'plans'
  | 'credits'
  | 'providers'
  | 'keys'
  | 'models'
  | 'presets'
  | 'users'
  | 'explore'
  | 'assets'
  | 'projects'
  | 'branding'
  | 'theme'
  | 'flags'
  | 'settings'
  | 'logs'
  | 'audit'

export const ADMIN_NAV_ICONS: Record<AdminNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: ChartLine,
  statistics: Gauge,
  landing: Layers,
  features: Sparkles,
  faq: CircleHelp,
  testimonials: MessageSquareQuote,
  announcements: Bell,
  categories: Tags,
  media: Image,
  pricing: CreditCard,
  plans: ListTree,
  credits: BadgeCheck,
  providers: Boxes,
  keys: KeyRound,
  models: Layers,
  presets: Wand2,
  users: Users,
  explore: Compass,
  assets: FileText,
  projects: FolderOpen,
  branding: Palette,
  theme: SlidersHorizontal,
  flags: ToggleLeft,
  settings: Settings,
  logs: ScrollText,
  audit: Activity,
}

/** The icon for a nav key. Falls back rather than returning undefined, which would throw. */
export function navIcon(name: AdminNavIcon): LucideIcon {
  return ADMIN_NAV_ICONS[name] ?? LayoutDashboard
}
