'use client'

import Link from 'next/link'
import { Compass, Pencil } from 'lucide-react'

/**
 * 대표 의도 배너 (SPEC 4.1)
 * PLAN v2 §3.7
 *
 * /admin 홈 상단 고정 노출.
 * purpose + intent 1~3 이 비어있으면 "설정하러 가기" CTA 표시.
 * 편집은 /admin/ops/settings/intent 에서만.
 */
interface IntentBannerProps {
  purpose: string
  intent_1: string
  intent_2: string
  intent_3: string
  year: number
}

export function IntentBanner({ purpose, intent_1, intent_2, intent_3, year }: IntentBannerProps) {
  const intents = [intent_1, intent_2, intent_3].filter(Boolean)
  const hasContent = purpose.trim().length > 0 || intents.length > 0

  if (!hasContent) {
    return (
      <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-100 text-brand-700 shrink-0">
            <Compass size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-800">대표 의도가 아직 설정되지 않았어요</p>
            <p className="text-xs text-brand-700 mt-0.5">올해 목적과 3가지 의도를 정하면 팀 전체가 방향을 공유할 수 있어요.</p>
          </div>
        </div>
        <Link
          href="/admin/ops/settings/intent"
          className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
        >
          <Pencil size={12} /> 지금 설정하기
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-brand-50 via-brand-50/40 to-surface border border-brand-100 rounded-2xl p-5 relative">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-700 shrink-0">
            <Compass size={16} />
          </span>
          <div>
            <p className="text-xs font-medium text-brand-700">{year}년 대표 의도</p>
            {purpose && <p className="text-sm font-bold text-text-primary leading-snug break-keep">{purpose}</p>}
          </div>
        </div>
        <Link
          href="/admin/ops/settings/intent"
          className="text-xs text-brand-600 hover:underline font-medium shrink-0 flex items-center gap-1"
        >
          <Pencil size={11} /> 편집
        </Link>
      </div>

      {intents.length > 0 && (
        <ol className="space-y-1.5 mt-2">
          {intents.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary leading-snug break-keep">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-600 text-white text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
