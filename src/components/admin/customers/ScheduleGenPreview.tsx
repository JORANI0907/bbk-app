'use client'

/**
 * 투입 일정 [수정 반영]·[생성] 미리보기 (2026-11-03)
 *   generate-schedules dry_run 결과(plans)를 고객별로 보여준다.
 *   결제청구이력 모달처럼 "무엇이 바뀌는지" 확인한 뒤 반영 버튼을 누르게 하는 용도.
 */

import type { CustomerPlan, PlanUpdateRow } from '@/lib/schedule-regenerate-plan'

interface Props {
  plans: CustomerPlan[]
  mode: 'create' | 'cleanup'
}

const fmt = (d: string) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`
const dates = (list: string[]) => list.map(fmt).join(', ')
const people = (n: { manager: string | null; workers: string[] }) =>
  `${n.manager ?? '담당자 없음'} / ${n.workers.length > 0 ? n.workers.join('·') : '작업자 없음'}`

function Line({ tone, label, count, children }: { tone: 'add' | 'change' | 'del' | 'keep'; label: string; count: number; children?: React.ReactNode }) {
  const color = tone === 'add' ? 'text-state-success' : tone === 'change' ? 'text-purple-700' : tone === 'del' ? 'text-state-danger' : 'text-text-tertiary'
  return (
    <div className="text-xs leading-normal break-keep">
      <span className={`font-semibold ${color}`}>{label} {count}건</span>
      {children && <span className="text-text-secondary"> — {children}</span>}
    </div>
  )
}

function UpdateRows({ rows }: { rows: PlanUpdateRow[] }) {
  return (
    <ul className="mt-1 space-y-0.5 pl-3 border-l-2 border-purple-200">
      {rows.map(r => (
        <li key={r.app_id} className="text-xs text-text-secondary break-keep">
          <span className="font-medium text-text-primary">{fmt(r.date)}</span>
          {' '}{people(r.before)}
          <span className="mx-1 text-purple-600">→</span>
          <span className="text-purple-800">{people(r.after)}</span>
        </li>
      ))}
    </ul>
  )
}

export function ScheduleGenPreview({ plans, mode }: Props) {
  const totals = plans.reduce((t, p) => ({
    create: t.create + p.create.length,
    changed: t.changed + p.update.filter(r => r.changed).length,
    del: t.del + p.delete.length,
  }), { create: 0, changed: 0, del: 0 })
  const nothing = totals.create === 0 && totals.changed === 0 && totals.del === 0

  return (
    <div className="mb-4 space-y-3">
      <div className={`rounded-lg px-3 py-2 text-xs font-semibold break-keep ${nothing ? 'bg-surface-sunken text-text-secondary' : 'bg-purple-50 text-purple-800'}`}>
        {nothing
          ? '바뀌는 내용이 없습니다. 요일별 담당자·작업자를 바꿨다면 세부창 하단 [저장]을 먼저 눌렀는지 확인해 주세요.'
          : `신규 ${totals.create}건 · 담당자/작업자 변경 ${totals.changed}건 · 정리(삭제) ${totals.del}건`}
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
        {plans.map(p => {
          const changed = p.update.filter(r => r.changed)
          const unchanged = p.update.length - changed.length
          return (
            <div key={p.customer_id} className="rounded-lg border border-border-subtle bg-surface p-3 space-y-1">
              <p className="text-sm font-semibold text-text-primary break-keep">{p.business_name}</p>
              {p.create.length > 0 && <Line tone="add" label="신규 생성" count={p.create.length}>{dates(p.create)}</Line>}
              {mode === 'cleanup' && changed.length > 0 && (
                <>
                  <Line tone="change" label="담당자·작업자 변경" count={changed.length} />
                  <UpdateRows rows={changed} />
                </>
              )}
              {mode === 'cleanup' && p.delete.length > 0 && <Line tone="del" label="정리(삭제)" count={p.delete.length}>{dates(p.delete)}</Line>}
              {mode === 'cleanup' && unchanged > 0 && <Line tone="keep" label="변경 없이 유지" count={unchanged} />}
              {mode === 'create' && p.existing.length > 0 && <Line tone="keep" label="이미 있어 건너뜀" count={p.existing.length}>{dates(p.existing)}</Line>}
              {p.completed.length > 0 && <Line tone="keep" label="완료 회차 (보존)" count={p.completed.length} />}
              {p.create.length === 0 && p.update.length === 0 && p.delete.length === 0 && p.existing.length === 0 && p.completed.length === 0 && (
                <p className="text-xs text-text-tertiary">기간 내 방문일이 없습니다. (방문 주기 확인)</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
