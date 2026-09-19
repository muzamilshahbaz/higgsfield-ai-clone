import type { Metadata } from 'next'
import { History } from 'lucide-react'

import { ComingSoon } from '@/components/studio/coming-soon'

export const metadata: Metadata = {
  title: 'History',
  description: 'Every job you have run, including the ones that failed.',
}

export default function Page() {
  return (
    <ComingSoon
      icon={History}
      title="History"
      description="Every job you have run, including the ones that failed."
      phase="Phase 4"
    />
  )
}
