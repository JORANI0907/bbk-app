'use client'

import dynamic from 'next/dynamic'
import type { CustomerMapPoint, ManagerLite } from './page'

const LeafletMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-tertiary">
      지도 로딩 중...
    </div>
  ),
})

interface Props {
  points: CustomerMapPoint[]
  managers: ManagerLite[]
}

export function MapView({ points, managers }: Props) {
  return <LeafletMap points={points} managers={managers} />
}
