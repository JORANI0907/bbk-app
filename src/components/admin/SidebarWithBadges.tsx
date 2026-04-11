'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'

interface Props {
  role: string
  userName: string
}

export function SidebarWithBadges({ role, userName }: Props) {
  const [navBadges, setNavBadges] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const res = await fetch('/api/admin/nav-badges')
        if (res.ok) {
          const data = await res.json()
          setNavBadges(data)
        }
      } catch {
        // 네트워크 오류 무시
      }
    }

    fetchBadges()
    // 30초마다 뱃지 새로고침
    const interval = setInterval(fetchBadges, 30_000)
    return () => clearInterval(interval)
  }, [])

  return <Sidebar role={role} userName={userName} navBadges={navBadges} />
}
