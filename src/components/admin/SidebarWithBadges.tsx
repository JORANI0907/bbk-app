'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import type { NavLayout } from '@/lib/nav-layout'

interface Props {
  role: string
  userName: string
}

export function SidebarWithBadges({ role, userName }: Props) {
  const [navBadges, setNavBadges] = useState<Record<string, number>>({})
  const [navLayout, setNavLayout] = useState<NavLayout | null>(null)

  // 뱃지: 30초 주기 갱신
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
    const interval = setInterval(fetchBadges, 30_000)
    return () => clearInterval(interval)
  }, [])

  // 저장된 사이드바 레이아웃: 초기 1회 로드
  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await fetch('/api/admin/nav-layout')
        if (!res.ok) return
        const data = await res.json()
        if (data.layout) setNavLayout(data.layout as NavLayout)
      } catch {
        // 무시 (저장된 레이아웃 없으면 원본 순서 사용)
      }
    }
    fetchLayout()
  }, [])

  const handleLayoutSaved = useCallback((next: NavLayout) => {
    setNavLayout(next)
  }, [])

  return (
    <Sidebar
      role={role}
      userName={userName}
      navBadges={navBadges}
      navLayout={navLayout}
      onLayoutSaved={handleLayoutSaved}
    />
  )
}
