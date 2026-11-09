/**
 * AI 분석 요청에 실려 오는 "아직 저장 안 된 자료" 처리 (2026-11-08)
 *   관리자가 자료를 올리고 [저장] 전에 분석을 누르면 DB 에는 그 자료가 없다. 그래서 화면이 자료 목록을 함께 보내고,
 *   서버는 저장된 자료를 우선 쓰되 없는 것은 이 목록에서 채운다.
 *   보안: 이 고객 폴더(care-manual-images/{customerId}/assets/) 아래 우리 저장소 URL 만 받는다.
 */

import type { SpaceAssetV2 } from '@/types/care-manual'
import { ASSET_KINDS } from '@/types/care-manual'

const KIND_VALUES: readonly string[] = ASSET_KINDS.map(k => k.value)
const MAX_INLINE = 20

export function assetPrefixFor(customerId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return base ? `${base}/storage/v1/object/public/care-manual-images/${customerId}/assets/` : null
}

/** 화면이 보낸 자료 목록을 검증해 SpaceAssetV2 로 */
export function parseInlineAssets(raw: unknown, customerId: string): SpaceAssetV2[] {
  const prefix = assetPrefixFor(customerId)
  if (!prefix || !Array.isArray(raw)) return []
  return raw.slice(0, MAX_INLINE).flatMap((v): SpaceAssetV2[] => {
    if (!v || typeof v !== 'object') return []
    const a = v as Record<string, unknown>
    if (typeof a.id !== 'string' || !a.id || typeof a.url !== 'string' || !a.url.startsWith(prefix) || a.url.includes('..')) return []
    if (typeof a.kind !== 'string' || !KIND_VALUES.includes(a.kind) || typeof a.mime !== 'string') return []
    return [{
      id: a.id.slice(0, 64),
      kind: a.kind as SpaceAssetV2['kind'],
      title: typeof a.title === 'string' ? a.title.slice(0, 100) : '',
      url: a.url,
      mime: a.mime.slice(0, 80),
      size: typeof a.size === 'number' ? a.size : 0,
      uploaded_at: typeof a.uploaded_at === 'string' ? a.uploaded_at : '',
    }]
  })
}

/** 저장된 자료 우선, 없는 id 만 화면 자료로 보충 */
export function mergeAssets(saved: SpaceAssetV2[], inline: SpaceAssetV2[]): SpaceAssetV2[] {
  const ids = new Set(saved.map(a => a.id))
  return [...saved, ...inline.filter(a => !ids.has(a.id))]
}
