import type { Metadata } from 'next'
import { Clapperboard } from 'lucide-react'

import { ComingSoon } from '@/components/studio/coming-soon'

export const metadata: Metadata = {
  title: 'Create',
  description: 'Pick a preset, drop in a frame, and generate.',
}

export default function Page() {
  return (
    <ComingSoon
      icon={Clapperboard}
      title="Create"
      description="Pick a preset, drop in a frame, and generate."
      phase="Phase 2"
    />
  )
}
