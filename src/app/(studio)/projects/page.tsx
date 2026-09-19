import type { Metadata } from 'next'
import { FolderOpen } from 'lucide-react'

import { ComingSoon } from '@/components/studio/coming-soon'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Everything you make, filed where you can find it.',
}

export default function Page() {
  return (
    <ComingSoon
      icon={FolderOpen}
      title="Projects"
      description="Everything you make, filed where you can find it."
      phase="Phase 4"
    />
  )
}
