import {
  Activity,
  BadgeCheck,
  Bell,
  Bolt,
  Boxes,
  Brush,
  Camera,
  Clapperboard,
  Compass,
  CreditCard,
  Download,
  Eye,
  Film,
  Flame,
  FolderOpen,
  Gauge,
  Globe,
  Heart,
  History,
  Image,
  Images,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Lock,
  type LucideIcon,
  MessageSquare,
  Palette,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Users,
  Video,
  Wand2,
  Zap,
} from 'lucide-react'

/**
 * The icons a CMS row may name.
 *
 * An allow-list, not a lookup into the whole library, for one specific reason: a
 * component that renders `LucideIcons[row.icon]` is resolving a module export by
 * a name an editor typed. That is fine right up until the name is `default` or
 * `createLucideIcon`, at which point a text field in an admin form picks which
 * function gets rendered as a component.
 *
 * It is also smaller. The full library is a few hundred exports, and bundling it
 * so that a feature card can show a sparkle is the classic way a landing page
 * gains half a megabyte of JavaScript.
 *
 * Keep the keys as the lucide export names. The admin form shows them as a
 * picker with previews, so the names being unfriendly costs nothing, and matching
 * the library means a designer's reference and this file agree.
 */
export const ICON_LIBRARY: Record<string, LucideIcon> = {
  Activity,
  BadgeCheck,
  Bell,
  Bolt,
  Boxes,
  Brush,
  Camera,
  Clapperboard,
  Compass,
  CreditCard,
  Download,
  Eye,
  Film,
  Flame,
  FolderOpen,
  Gauge,
  Globe,
  Heart,
  History,
  Image,
  Images,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Lock,
  MessageSquare,
  Palette,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Users,
  Video,
  Wand2,
  Zap,
}

export const ICON_NAMES = Object.keys(ICON_LIBRARY).sort()

/**
 * The icon for a stored name, or `fallback`.
 *
 * Returns the fallback rather than null so callers do not each need a branch,
 * and so a row naming an icon that has since been removed from the list renders
 * a generic mark instead of a hole in the grid.
 */
export function resolveIcon(name: string | null | undefined, fallback: LucideIcon = Sparkles): LucideIcon {
  if (!name) return fallback
  return ICON_LIBRARY[name] ?? fallback
}

export function isIconName(name: string): boolean {
  return Object.hasOwn(ICON_LIBRARY, name)
}

/**
 * Column spans the bento grid accepts.
 *
 * The grid is `lg:grid-cols-6` and the layout is asymmetric on purpose, so these
 * are the only values that produce a row that adds up. Anything else is a class
 * Tailwind has not generated — the JIT compiler only emits classes it finds in
 * source, so a span typed into a form would be a string with no CSS behind it.
 * That is the real reason this is an allow-list rather than a text field.
 */
export const FEATURE_SPANS = [
  { value: 'lg:col-span-2', label: 'One third' },
  { value: 'lg:col-span-3', label: 'One half' },
  { value: 'lg:col-span-4', label: 'Two thirds' },
  { value: 'lg:col-span-6', label: 'Full width' },
] as const

/**
 * Typed as `readonly string[]` rather than the literal union.
 *
 * The callers are validating a string that arrived from a form, and a union type
 * makes `includes` refuse the very argument it exists to check — the narrowing has
 * to happen *after* the test, not before it.
 */
export const FEATURE_SPAN_VALUES: readonly string[] = FEATURE_SPANS.map((span) => span.value)
