'use client'

import { useState, useEffect } from 'react'

/**
 * 클라이언트 브라우저의 현재 날짜를 'M월 d일 (요일)' 형식으로 렌더.
 * 서버 렌더(UTC) + CDN 캐시 문제를 회피하기 위해 클라이언트에서 매번 계산한다.
 */
export function TodayLabel({ className = '' }: { className?: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]
      setLabel(`${now.getMonth() + 1}월 ${now.getDate()}일 (${weekday})`)
    }
    update()
    // 자정에 날짜가 넘어가면 갱신
    const ms = 60_000
    const t = setInterval(update, ms)
    return () => clearInterval(t)
  }, [])

  // 초기 SSR에서는 빈 문자열 → hydration 직후 즉시 채워짐
  return <span className={className}>{label}</span>
}
