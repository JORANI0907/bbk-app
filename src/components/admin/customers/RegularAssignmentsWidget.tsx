'use client'

/**
 * Phase 38/39: 정기케어(정기딥/정기엔드) 요일별·일자별 담당자·작업자 배정 위젯.
 * 방문 일정 섹션 내부에 노출되어 방문주기 단위(unit)에 따라 자동 스위칭.
 *
 * 정책:
 *  - unit='week'  → 요일별 위젯 (일~토 7개 행). 각 요일에 담당자·작업자 배정.
 *  - unit='month' → 일자별 위젯 (config.dates 에 있는 일자 각각). 방문 일자 편집 시
 *    없어진 일자에 대한 배정은 실시간으로 orphan 경고 노출 (사용자에게 인지시킴).
 *  - unit='day' or 그 외 → 상단 담당직원 자동 사용 안내 카드만 노출.
 *
 * 하단 우선 정책: 위젯에 하나라도 값이 있으면 회차 생성 시 그 매핑만 사용 (상단 무시).
 * 전체 비어있으면 상단 assigned_user_id / worker_ids 로 fallback.
 *
 * dirty 상태에서는 [수정 반영]/[생성] 버튼 잠금 (props 로 소비 측에서 처리).
 */
import type { VisitCycleConfig } from '@/lib/schedule-generator'

type AssignmentMap = Record<string, { user_id: string | null; worker_ids: string[] }>

interface UserOption { id: string; name: string; role: string | null }
interface WorkerOption { id: string; name: string | null; employment_type?: string | null }

interface Props {
  visitCycleUnit: string | null
  // 방문 일자 목록 (config.dates) — unit=month 위젯에서 행 렌더링에 사용.
  monthlyVisitDates: number[]
  // 요일별 배정.
  weekdayAssignments: AssignmentMap
  onChangeWeekdayAssignments: (updater: AssignmentMap | ((prev: AssignmentMap) => AssignmentMap)) => void
  hasAnyWeekdayAssignment: boolean
  weekdayAssignedDayLabels: string[]
  weekdayAssignmentsDirty: boolean
  // 일자별 배정.
  monthlyDateAssignments: AssignmentMap
  onChangeMonthlyDateAssignments: (updater: AssignmentMap | ((prev: AssignmentMap) => AssignmentMap)) => void
  hasAnyMonthlyDateAssignment: boolean
  monthlyDateAssignedDayLabels: string[]
  monthlyDateAssignmentsDirty: boolean
  // 방문일자 목록에는 없는데 배정만 남아있는 orphan 일자 배열.
  monthlyOrphanDays: string[]
  // 선택 옵션.
  usersList: UserOption[]
  workersList: WorkerOption[]
}

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

export function RegularAssignmentsWidget(props: Props) {
  const {
    visitCycleUnit,
    monthlyVisitDates,
    weekdayAssignments, onChangeWeekdayAssignments,
    hasAnyWeekdayAssignment, weekdayAssignedDayLabels, weekdayAssignmentsDirty,
    monthlyDateAssignments, onChangeMonthlyDateAssignments,
    hasAnyMonthlyDateAssignment, monthlyDateAssignedDayLabels, monthlyDateAssignmentsDirty,
    monthlyOrphanDays,
    usersList, workersList,
  } = props

  // ────────────────────────────────────────────
  // 매일(day) or 미설정: 상단 담당직원 사용 안내만 표시.
  // ────────────────────────────────────────────
  if (visitCycleUnit === 'day' || !visitCycleUnit) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-sunken/40 p-3">
        <p className="text-xs text-text-secondary break-keep leading-relaxed">
          <b className="text-text-primary">매일 방문 계약</b> 은 요일·일자별 배정 대신 <b className="text-brand-700">상단 담당직원</b> 값이 모든 회차에 자동 적용됩니다.
          <br />
          <span className="text-[11px] text-text-tertiary">담당자·작업자 회전이 필요하면 방문 주기를 <b>주간</b> 또는 <b>월간</b> 으로 바꾸면 이 자리에 배정 위젯이 나타납니다.</span>
        </p>
      </div>
    )
  }

  // ────────────────────────────────────────────
  // 주간(week): 요일별 위젯.
  // ────────────────────────────────────────────
  if (visitCycleUnit === 'week') {
    return (
      <div className="rounded-lg border border-purple-200 bg-purple-50/30">
        <div className="bg-purple-50 px-3 py-2 border-b border-purple-200 flex items-center justify-between gap-2 flex-wrap rounded-t-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-purple-800">요일별 담당자·작업자 <span className="text-purple-400 font-normal">(선택)</span></p>
            {hasAnyWeekdayAssignment ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">
                ✓ 이 값 반영 중 (상단 무시)
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-sunken text-text-tertiary border border-border-subtle whitespace-nowrap">
                상단 담당직원 사용 중
              </span>
            )}
            {weekdayAssignmentsDirty && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap animate-pulse">
                ● 저장 안 됨 · 하단 [저장] 필요
              </span>
            )}
          </div>
          {hasAnyWeekdayAssignment && (
            <button
              type="button"
              onClick={() => onChangeWeekdayAssignments({})}
              className="text-[11px] text-purple-600 hover:text-purple-800 underline underline-offset-2"
            >
              전체 비우기
            </button>
          )}
        </div>
        <div className="p-3 flex flex-col gap-1.5">
          <p className="text-[11px] text-text-tertiary mb-1 break-keep leading-relaxed">
            <b className="text-purple-700">규칙</b>: 한 요일이라도 값이 있으면 <b>요일별 배정만</b> 반영. 전체 비어있으면 상단 담당직원 값 반영.
            비운 요일 회차는 담당자·작업자 없이 생성.
            <br />
            <b className="text-purple-700">저장 순서</b>: ① 요일별 편집 → ② 세부창 <b>하단 [저장]</b> 클릭해서 마스터 반영 → ③ 필요시 <b>[수정 반영]</b> 또는 <b>[생성]</b> 클릭해 회차에 적용.
            {hasAnyWeekdayAssignment && !weekdayAssignmentsDirty && (
              <>
                <br />
                <span className="text-emerald-600">✓ 저장됨 · 세팅 요일: <b>{weekdayAssignedDayLabels.join(' / ')}</b></span>
              </>
            )}
          </p>
          {(['0', '1', '2', '3', '4', '5', '6'] as const).map(dayKey => {
            const label = WEEKDAY_KR[Number(dayKey)]
            const cur = weekdayAssignments[dayKey] ?? { user_id: null, worker_ids: [] as string[] }
            const setUserId = (v: string) => onChangeWeekdayAssignments(prev => ({
              ...prev,
              [dayKey]: { user_id: v || null, worker_ids: prev[dayKey]?.worker_ids ?? [] },
            }))
            const toggleWorker = (wid: string) => onChangeWeekdayAssignments(prev => {
              const cw = prev[dayKey]?.worker_ids ?? []
              const next = cw.includes(wid) ? cw.filter(x => x !== wid) : [...cw, wid]
              return { ...prev, [dayKey]: { user_id: prev[dayKey]?.user_id ?? null, worker_ids: next } }
            })
            const selectedWorkerNames = cur.worker_ids
              .map(id => workersList.find(w => w.id === id)?.name)
              .filter((n): n is string => !!n)
            return (
              <div key={dayKey} className="flex items-center gap-2 flex-wrap py-0.5 border-b border-purple-100 last:border-b-0">
                <span className={`text-xs font-bold w-6 shrink-0 text-center ${dayKey === '0' ? 'text-red-500' : dayKey === '6' ? 'text-blue-500' : 'text-text-secondary'}`}>{label}</span>
                <select
                  value={cur.user_id ?? ''}
                  onChange={e => setUserId(e.target.value)}
                  className="flex-1 min-w-[110px] max-w-[170px] border border-purple-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">담당자 (기본값)</option>
                  {usersList
                    .filter(u => u.role === 'admin' || u.role === 'worker')
                    .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <details className="relative flex-1 min-w-[130px] max-w-[200px]">
                  <summary className="cursor-pointer list-none border border-purple-200 rounded-md px-2 py-1 text-xs bg-white text-text-primary hover:border-purple-400">
                    {selectedWorkerNames.length === 0
                      ? <span className="text-text-tertiary">작업자 선택</span>
                      : selectedWorkerNames.length === 1
                        ? selectedWorkerNames[0]
                        : `${selectedWorkerNames[0]} 외 ${selectedWorkerNames.length - 1}명`}
                  </summary>
                  <div className="absolute z-20 left-0 mt-1 bg-white border border-purple-200 rounded-lg shadow-lg p-2 max-h-52 overflow-y-auto min-w-[180px]">
                    {workersList.length === 0 ? (
                      <p className="text-[11px] text-text-tertiary px-1">작업자가 없습니다.</p>
                    ) : (
                      workersList
                        .filter(w => !!w.employment_type)
                        .map(w => (
                          <label key={w.id} className="flex items-center gap-2 px-1 py-1 hover:bg-purple-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cur.worker_ids.includes(w.id)}
                              onChange={() => toggleWorker(w.id)}
                            />
                            <span className="text-xs text-text-primary">{w.name ?? '(이름없음)'}</span>
                          </label>
                        ))
                    )}
                  </div>
                </details>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────
  // 월간(month): 방문일자별 위젯 + orphan 실시간 경고.
  // ────────────────────────────────────────────
  const monthlyDaysToRender: string[] = monthlyVisitDates.map(String)

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/30">
      <div className="bg-purple-50 px-3 py-2 border-b border-purple-200 flex items-center justify-between gap-2 flex-wrap rounded-t-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-purple-800">일자별 담당자·작업자 <span className="text-purple-400 font-normal">(선택)</span></p>
          {hasAnyMonthlyDateAssignment ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">
              ✓ 이 값 반영 중 (상단 무시)
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-sunken text-text-tertiary border border-border-subtle whitespace-nowrap">
              상단 담당직원 사용 중
            </span>
          )}
          {monthlyDateAssignmentsDirty && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap animate-pulse">
              ● 저장 안 됨 · 하단 [저장] 필요
            </span>
          )}
        </div>
        {hasAnyMonthlyDateAssignment && (
          <button
            type="button"
            onClick={() => onChangeMonthlyDateAssignments({})}
            className="text-[11px] text-purple-600 hover:text-purple-800 underline underline-offset-2"
          >
            전체 비우기
          </button>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-[11px] text-text-tertiary mb-1 break-keep leading-relaxed">
          <b className="text-purple-700">규칙</b>: 한 일자라도 값이 있으면 <b>일자별 배정만</b> 반영. 전체 비어있으면 상단 담당직원 값 반영.
          비운 일자 회차는 담당자·작업자 없이 생성.
          <br />
          <b className="text-purple-700">저장 순서</b>: ① 방문 일자 설정 → ② 일자별 편집 → ③ 세부창 <b>하단 [저장]</b> 클릭 → ④ 필요시 <b>[수정 반영]</b> 또는 <b>[생성]</b> 클릭.
          {hasAnyMonthlyDateAssignment && !monthlyDateAssignmentsDirty && (
            <>
              <br />
              <span className="text-emerald-600">✓ 저장됨 · 세팅 일자: <b>{monthlyDateAssignedDayLabels.join(' / ')}</b></span>
            </>
          )}
        </p>

        {/* 실시간 orphan 경고: 방문일자 목록에서 사라진 일자에 배정만 남아있으면 표시. */}
        {monthlyOrphanDays.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 rounded-md p-2 text-[11px] text-amber-800 break-keep leading-relaxed">
            ⚠ <b>방문일자가 바뀌면서 배정이 사라진 일자</b>: <b>{monthlyOrphanDays.map(d => `${d}일`).join(', ')}</b>
            <br />
            이 일자의 배정은 회차 생성 시 무시됩니다. 방문일자를 원래대로 되돌리거나, 아래 <b>[사라진 일자 배정 정리]</b> 버튼으로 배정을 제거하세요.
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => onChangeMonthlyDateAssignments(prev => {
                  const next: AssignmentMap = { ...prev }
                  for (const k of monthlyOrphanDays) delete next[k]
                  return next
                })}
                className="text-[11px] px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                사라진 일자 배정 정리
              </button>
            </div>
          </div>
        )}

        {monthlyDaysToRender.length === 0 && (
          <p className="text-[11px] text-text-tertiary text-center py-3 border border-dashed border-purple-200 rounded-md bg-white">
            방문 일자가 아직 설정되지 않았습니다.<br />
            위 방문 주기에서 매월 방문할 일자를 먼저 지정하세요.
          </p>
        )}

        {monthlyDaysToRender.map(dayKey => {
          const cur = monthlyDateAssignments[dayKey] ?? { user_id: null, worker_ids: [] as string[] }
          const setUserId = (v: string) => onChangeMonthlyDateAssignments(prev => ({
            ...prev,
            [dayKey]: { user_id: v || null, worker_ids: prev[dayKey]?.worker_ids ?? [] },
          }))
          const toggleWorker = (wid: string) => onChangeMonthlyDateAssignments(prev => {
            const cw = prev[dayKey]?.worker_ids ?? []
            const next = cw.includes(wid) ? cw.filter(x => x !== wid) : [...cw, wid]
            return { ...prev, [dayKey]: { user_id: prev[dayKey]?.user_id ?? null, worker_ids: next } }
          })
          const selectedWorkerNames = cur.worker_ids
            .map(id => workersList.find(w => w.id === id)?.name)
            .filter((n): n is string => !!n)
          return (
            <div key={dayKey} className="flex items-center gap-2 flex-wrap py-0.5 border-b border-purple-100 last:border-b-0">
              <span className="text-xs font-bold w-10 shrink-0 text-center text-text-secondary">{dayKey}일</span>
              <select
                value={cur.user_id ?? ''}
                onChange={e => setUserId(e.target.value)}
                className="flex-1 min-w-[110px] max-w-[170px] border border-purple-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">담당자 (기본값)</option>
                {usersList
                  .filter(u => u.role === 'admin' || u.role === 'worker')
                  .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <details className="relative flex-1 min-w-[130px] max-w-[200px]">
                <summary className="cursor-pointer list-none border border-purple-200 rounded-md px-2 py-1 text-xs bg-white text-text-primary hover:border-purple-400">
                  {selectedWorkerNames.length === 0
                    ? <span className="text-text-tertiary">작업자 선택</span>
                    : selectedWorkerNames.length === 1
                      ? selectedWorkerNames[0]
                      : `${selectedWorkerNames[0]} 외 ${selectedWorkerNames.length - 1}명`}
                </summary>
                <div className="absolute z-20 left-0 mt-1 bg-white border border-purple-200 rounded-lg shadow-lg p-2 max-h-52 overflow-y-auto min-w-[180px]">
                  {workersList.length === 0 ? (
                    <p className="text-[11px] text-text-tertiary px-1">작업자가 없습니다.</p>
                  ) : (
                    workersList
                      .filter(w => !!w.employment_type)
                      .map(w => (
                        <label key={w.id} className="flex items-center gap-2 px-1 py-1 hover:bg-purple-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cur.worker_ids.includes(w.id)}
                            onChange={() => toggleWorker(w.id)}
                          />
                          <span className="text-xs text-text-primary">{w.name ?? '(이름없음)'}</span>
                        </label>
                      ))
                  )}
                </div>
              </details>
            </div>
          )
        })}

        {/* 방문일자를 바꾸면 배정이 깨진다는 경고 (편집 중 실시간 안내) */}
        {monthlyDaysToRender.length > 0 && (
          <p className="text-[10px] text-text-tertiary mt-2 break-keep">
            💡 위 방문 주기의 <b>매월 방문 일자</b> 를 바꾸면 사라진 일자에 대한 배정은 <b className="text-amber-700">자동으로 반영되지 않습니다</b>.
            새 일자에는 다시 배정해야 합니다.
          </p>
        )}
      </div>
    </div>
  )
}
