'use client'

import { useEffect } from 'react'

/**
 * 새 서비스워커가 활성화되면 자동으로 페이지를 새로고침합니다.
 * 배포 후 직원 폰에서 수동으로 캐시를 지우지 않아도 새 버전이 자동 적용됩니다.
 */
export function SwUpdateReloader() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // 새 서비스워커가 제어권을 가져올 때 자동 새로고침
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  return null
}
