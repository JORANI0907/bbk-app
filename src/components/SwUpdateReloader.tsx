'use client'

import { useEffect } from 'react'

/**
 * Service Worker 자동 업데이트 + 새 버전 활성화 시 자동 새로고침.
 * - controllerchange 수신 시 전체 새로고침 (새 SW가 제어권을 가졌을 때)
 * - 페이지 로드 직후, 그리고 5분마다 registration.update() 능동 호출
 *   → 사용자가 수동으로 캐시 비우지 않아도 배포 후 자동으로 새 버전 반영
 */
export function SwUpdateReloader() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    let reloaded = false
    const reloadOnce = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce)

    let intervalId: ReturnType<typeof setInterval> | null = null
    navigator.serviceWorker.ready
      .then(reg => {
        reg.update().catch(() => {})
        intervalId = setInterval(() => reg.update().catch(() => {}), 5 * 60_000)
      })
      .catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return null
}
