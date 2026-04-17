'use client'

import { useEffect, useState } from 'react'

/**
 * 앱 캐시/서비스워커 강제 초기화 페이지.
 * 배포 후에도 옛 번들이 보일 때 /force-refresh 로 접속하면 모든 캐시를 비우고
 * 서비스워커를 해제한 뒤 홈으로 리다이렉트.
 */
export default function ForceRefreshPage() {
  const [status, setStatus] = useState('초기화 준비 중...')

  useEffect(() => {
    (async () => {
      try {
        setStatus('서비스워커 해제 중...')
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
        }

        setStatus('캐시 삭제 중...')
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }

        try {
          localStorage.removeItem('next-pwa')
        } catch { /* ignore */ }

        setStatus('완료! 새 화면으로 이동합니다...')
        setTimeout(() => {
          const bust = Date.now()
          window.location.replace(`/?v=${bust}`)
        }, 800)
      } catch (err) {
        setStatus(`오류: ${err instanceof Error ? err.message : '초기화 실패'}`)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
          <span className="text-2xl">🔄</span>
        </div>
        <h1 className="text-base font-bold text-gray-900 mb-2">앱 새로고침</h1>
        <p className="text-sm text-gray-500">{status}</p>
      </div>
    </div>
  )
}
