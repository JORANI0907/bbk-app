'use client'

/**
 * /admin (홈) 상단 대표 의도 섹션.
 * admin + worker 모두에게 보임.
 * intent 만 필요하므로 /api/ops/intent (경량 endpoint) 사용.
 */

import { useEffect, useState } from 'react'
import { IntentBanner } from './IntentBanner'

interface IntentData {
  purpose: string
  intent_1: string
  intent_2: string
  intent_3: string
  year: number
}

export function HomeIntentSection() {
  const [data, setData] = useState<IntentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ops/intent')
      .then(r => r.json())
      .then((json: { ok: boolean; intent: IntentData }) => {
        if (cancelled) return
        if (json.ok) setData(json.intent)
      })
      .catch(() => { /* 조용히 실패 — 홈 렌더에 영향 없음 */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading || !data) return null

  return (
    <IntentBanner
      purpose={data.purpose}
      intent_1={data.intent_1}
      intent_2={data.intent_2}
      intent_3={data.intent_3}
      year={data.year}
    />
  )
}
