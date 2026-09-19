import type { Metadata } from 'next'
import { Images } from 'lucide-react'

import { ComingSoon } from '@/components/studio/coming-soon'

export const metadata: Metadata = {
  title: 'Library',
  description: 'Every asset you own, in one grid.',
}

export default function Page() {
  return (
    <ComingSoon
      icon={Images}
      title="Library"
      description="Every asset you own, in one grid."
      phase="Phase 4"
    />
  )
}
