/**
 * 1회성케어·일반일정 고객의 "마스터 작업자 → 회차(work_assignments)" 동기화 규칙.
 *
 * 고객 상세에서 작업자를 저장하면 그 고객의 신청서 1건에 작업자 배정을 복사해야
 * 급여정산 탭(work_assignments 기준)에 사람이 뜬다. 예전엔 허용 상태 목록(화이트리스트)
 * 으로 골랐는데 DB에 '결제완료', '계산서발행완료', '카드결제 완료' 같은 상태가 늘어나며
 * 목록에서 빠진 신청서는 조용히 건너뛰어 급여에 누락됐다 (2026-11-26 팝성형외과 케이스).
 * → 취소·환급처럼 "일을 안 한" 상태만 제외하는 방식으로 뒤집는다.
 */

/** 동기화에서 제외하는 상태 — 일이 없어진 건만. 새 상태가 생겨도 기본은 동기화 대상 */
export const ONE_SHOT_SYNC_EXCLUDED_STATUSES: readonly string[] = ['예약취소', '예약금환급완료']

export interface SyncCandidateApp {
  id: string
  status: string | null
  construction_date: string | null
  business_name: string | null
}

export type WorkerSyncOutcome = 'synced' | 'cleared' | 'skipped' | 'not_applicable'

export interface WorkerSyncResult {
  outcome: WorkerSyncOutcome
  /** skipped 일 때 사람이 읽을 이유 */
  reason: string | null
}

/** 이 상태의 신청서가 작업자 동기화 대상인지 (null 상태도 대상) */
export function isOneShotSyncableStatus(status: string | null | undefined): boolean {
  if (!status) return true
  return !ONE_SHOT_SYNC_EXCLUDED_STATUSES.includes(status.trim())
}

/**
 * 최신순으로 정렬된 신청서 목록에서 동기화할 1건을 고른다.
 * 취소·환급 상태를 건너뛰고, 시공일자·업체명이 있어야 work_assignments 를 만들 수 있다.
 */
export function pickOneShotSyncTarget<T extends SyncCandidateApp>(appsNewestFirst: readonly T[]): T | null {
  for (const app of appsNewestFirst) {
    if (!isOneShotSyncableStatus(app.status)) continue
    if (!app.construction_date || !app.business_name) continue
    return app
  }
  return null
}

/** 동기화 대상이 없을 때 화면에 보여줄 이유 */
export function describeSkipReason(appsNewestFirst: readonly SyncCandidateApp[]): string {
  if (appsNewestFirst.length === 0) return '연결된 일정(신청서)이 없어 작업자가 일정에 반영되지 않았습니다.'
  const live = appsNewestFirst.filter(a => isOneShotSyncableStatus(a.status))
  if (live.length === 0) return '일정이 모두 취소·환급 상태라 작업자가 일정에 반영되지 않았습니다.'
  return '일정에 시공일자 또는 업체명이 비어 있어 작업자가 일정에 반영되지 않았습니다.'
}
