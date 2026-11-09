import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_LABEL } from '@/lib/care-manual-status'

const CLS: Record<ItemStatus, string> = {
  ok: 'bg-state-success-bg text-green-800',
  due: 'bg-state-warning-bg text-amber-800',
  issue: 'bg-state-danger-bg text-red-800',
  none: 'bg-surface-sunken text-text-tertiary',
}
const DOT: Record<ItemStatus, string> = {
  ok: 'bg-state-success',
  due: 'bg-state-warning',
  issue: 'bg-state-danger',
  none: 'bg-slate-400',
}

/** 관리 상태 칩 — 초록 정상 · 노랑 점검 확인 필요 · 빨강 특이사항 · 회색 기록 없음 */
export function StatusChip({ status, small = false }: { status: ItemStatus; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'px-1.5 py-0 text-[11px]' : 'px-2 py-0.5 text-xs'} ${CLS[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}
