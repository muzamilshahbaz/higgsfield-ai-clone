import type { Metadata } from 'next'
import { Compass } from 'lucide-react'

import { ComingSoon } from '@/components/studio/coming-soon'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'What the community is making. Remix anything.',
}

export default function Page() {
  return (
    <ComingSoon
      icon={Compass}
      title="Explore"
      description="What the community is making. Remix anything."
      phase="Phase 5"
    />
  )
}
