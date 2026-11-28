/**
 * 볼타 세금계산서 발행 요청 (관리자 "볼타로 발행" 버튼이 호출)
 *
 * 흐름 (건별):
 *  1. HometaxRow → 볼타 요청 변환 (실패 시 DB 미변경, 사유 반환)
 *  2. 원본(청구서/신청서) 존재·미발행 확인 (화면이 오래된 상태일 때 오발행 방지)
 *  3. 초안 상태 조회 → requested/issued 면 건너뜀. 아니면 스냅샷 upsert
 *  4. 조건부 update 로 'requested' 선점 (status in draft/failed AND attempts 동일).
 *     0행이면 다른 요청이 먼저 잡은 것 → 건너뜀 (동시 클릭 중복 발행 방지)
 *  5. 볼타 호출
 *     - 접수: bolta_issuance_key 저장
 *     - 4xx(429 제외): failed (볼타가 받지 않은 것이 확실)
 *     - 5xx·429·응답 없음·본문 이상: 상태 조회로 보정. 못 찾으면 'requested' 유지 + 확인 필요
 *       (재요청하면 이중 발행될 수 있으므로 자동 재시도 금지)
 *
 * 멈춘 'requested' 건은 recheckRequested() 로 상태 조회해 접수 여부를 확정한다.
 * 발행 완료 처리(상태·고객 알림)는 웹훅(/api/webhooks/bolta)이 담당한다.
 */

import type { createServiceClient } from '@/lib/supabase/server'
import type { HometaxRow } from '@/lib/hometax-csv'
import { mapRowToBoltaRequest, BoltaMappingError, ymdToIso } from '@/lib/bolta/mapper'
import { issueTaxInvoice, getIssueStatusByReference, BoltaApiError } from '@/lib/bolta/client'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface IssueItemInput {
  source: 'application' | 'billing'
  source_id: string
  customer_id: string | null
  row: HometaxRow
}

export type IssueItemStatus = 'requested' | 'failed' | 'skipped' | 'uncertain'

export interface IssueItemResult {
  source: 'application' | 'billing'
  source_id: string
  status: IssueItemStatus
  message: string
  issuanceKey?: string
  clientReferenceId?: string
}

interface DraftState {
  id: string
  issue_status: string
  issue_attempts: number
  client_reference_id: string | null
  bolta_issuance_key: string | null
  requested_at: string | null
}

const DRAFT_STATE_COLUMNS = 'id, issue_status, issue_attempts, client_reference_id, bolta_issuance_key, requested_at'

/** 상태 조회로도 접수 기록이 없을 때, 이 시간이 지나면 failed 로 풀어 재요청을 허용 */
export const RECHECK_RELEASE_AFTER_MS = 30 * 60 * 1000

export function buildClientReferenceId(source: string, sourceId: string, attempt: number): string {
  return `bbk-${source}-${sourceId}-${attempt}`
}

/** 볼타가 요청을 받지 않았다고 확정할 수 있는 오류인지 (4xx, 429 제외) */
export function isDefiniteRejection(e: BoltaApiError): boolean {
  return e.status >= 400 && e.status < 500 && e.status !== 429 && e.code !== 'INVALID_RESPONSE'
}

function draftItemsFromRow(row: HometaxRow) {
  return row.items.map(it => ({
    name: it.name,
    spec: it.spec ?? undefined,
    qty: it.qty ?? 1,
    unit_price: it.unit_price ?? it.supply_amount,
    supply_amount: it.supply_amount,
    vat: it.vat,
    remark: it.remark ?? undefined,
  }))
}

// ── 원본 확인 ────────────────────────────────────────────────
async function verifySource(supabase: ServiceClient, item: IssueItemInput): Promise<string | null> {
  if (item.source === 'billing') {
    const { data, error } = await supabase
      .from('service_billings')
      .select('id, tax_invoice_issued, status')
      .eq('id', item.source_id)
      .maybeSingle()
    if (error) return `청구서 조회 실패: ${error.message}`
    if (!data) return '청구서를 찾을 수 없습니다 (삭제됨?)'
    if (data.tax_invoice_issued) return '이미 발행완료 처리된 청구서입니다'
    if (data.status === 'cancelled') return '취소된 청구서입니다'
    return null
  }
  const { data, error } = await supabase
    .from('service_applications')
    .select('id, tax_invoice_issued, deleted_at')
    .eq('id', item.source_id)
    .maybeSingle()
  if (error) return `신청서 조회 실패: ${error.message}`
  if (!data || data.deleted_at) return '신청서를 찾을 수 없습니다 (삭제됨?)'
  if (data.tax_invoice_issued) return '이미 발행완료 처리된 신청서입니다'
  return null
}

// ── 초안 상태 ────────────────────────────────────────────────
async function getDraftState(supabase: ServiceClient, item: IssueItemInput): Promise<DraftState | null> {
  const { data, error } = await supabase
    .from('tax_invoice_drafts')
    .select(DRAFT_STATE_COLUMNS)
    .eq('source', item.source)
    .eq('source_id', item.source_id)
    .maybeSingle()
  if (error) throw new Error(`초안 조회 실패: ${error.message}`)
  return (data as DraftState | null) ?? null
}

async function upsertDraftSnapshot(
  supabase: ServiceClient,
  item: IssueItemInput,
  supplierId: string | null,
): Promise<DraftState> {
  const { data, error } = await supabase
    .from('tax_invoice_drafts')
    .upsert({
      source: item.source,
      source_id: item.source_id,
      supplier_id: supplierId,
      receiver_business_number: item.row.receiver.registration_number ?? null,
      receiver_business_name: item.row.receiver.business_name,
      receiver_owner_name: item.row.receiver.owner_name ?? null,
      receiver_address: item.row.receiver.address ?? null,
      receiver_email: item.row.receiver.email ?? null,
      receiver_email_2: item.row.receiver.email_2 ?? null,
      receiver_business_type: item.row.receiver.business_type ?? null,
      receiver_business_item: item.row.receiver.business_item ?? null,
      items: draftItemsFromRow(item.row),
      invoice_kind: item.row.invoice_kind ?? '01',
      bill_receipt_type: item.row.receipt_type ?? '01',
      written_date: ymdToIso(item.row.written_date),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source,source_id' })
    .select(DRAFT_STATE_COLUMNS)
    .single()
  if (error) throw new Error(`초안 저장 실패: ${error.message}`)
  return data as DraftState
}

/**
 * 'requested' 선점. 같은 attempts 값에서 draft/failed 인 행만 바꾸므로
 * 동시에 두 요청이 들어와도 한 쪽만 성공한다. 실패(0행)면 false.
 */
async function claimRequested(
  supabase: ServiceClient,
  draft: DraftState,
  attempt: number,
  clientRef: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tax_invoice_drafts')
    .update({
      issue_status: 'requested',
      issue_attempts: attempt,
      client_reference_id: clientRef,
      bolta_issuance_key: null,
      requested_at: new Date().toISOString(),
      failure_code: null,
      failure_message: null,
    })
    .eq('id', draft.id)
    .in('issue_status', ['draft', 'failed'])
    .eq('issue_attempts', draft.issue_attempts)
    .select('id')
  if (error) throw new Error(`요청 상태 저장 실패: ${error.message}`)
  return (data ?? []).length > 0
}

/** 내 시도(clientRef)가 아직 requested 일 때만 키 저장 */
async function saveIssuanceKey(supabase: ServiceClient, clientRef: string, issuanceKey: string) {
  await supabase
    .from('tax_invoice_drafts')
    .update({ bolta_issuance_key: issuanceKey, failure_code: null, failure_message: null })
    .eq('client_reference_id', clientRef)
    .eq('issue_status', 'requested')
}

/** 내 시도(clientRef)가 아직 requested 일 때만 failed 로. 다른 시도의 결과는 덮어쓰지 않는다 */
async function markFailed(supabase: ServiceClient, clientRef: string, code: string, message: string) {
  await supabase
    .from('tax_invoice_drafts')
    .update({ issue_status: 'failed', failure_code: code, failure_message: message })
    .eq('client_reference_id', clientRef)
    .eq('issue_status', 'requested')
}

/** 응답을 못 받았거나 접수 여부가 불확실한 경우: 상태 조회로 확정 */
async function resolveUncertain(
  supabase: ServiceClient,
  clientRef: string,
  item: IssueItemInput,
  cause: string,
): Promise<IssueItemResult> {
  const base = { source: item.source, source_id: item.source_id, clientReferenceId: clientRef }
  try {
    const status = await getIssueStatusByReference(clientRef)
    if (status) {
      await saveIssuanceKey(supabase, clientRef, status.issuanceKey)
      return { ...base, status: 'requested', issuanceKey: status.issuanceKey, message: '접수 확인 (상태 조회)' }
    }
  } catch {
    // 조회도 실패 → 아래 uncertain 처리
  }
  await supabase
    .from('tax_invoice_drafts')
    .update({ failure_code: 'NO_RESPONSE', failure_message: `응답 없음 — 확인 필요 (${cause})` })
    .eq('client_reference_id', clientRef)
    .eq('issue_status', 'requested')
  return { ...base, status: 'uncertain', message: '볼타 응답 없음. 재요청하지 말고 "요청 상태 확인"으로 결과를 확인하세요' }
}

async function issueOne(
  supabase: ServiceClient,
  item: IssueItemInput,
  supplierId: string | null,
): Promise<IssueItemResult> {
  const base = { source: item.source, source_id: item.source_id }

  let request
  try {
    request = mapRowToBoltaRequest(item.row)
  } catch (e) {
    return { ...base, status: 'failed', message: e instanceof BoltaMappingError ? e.message : '요청 변환 실패' }
  }

  const sourceProblem = await verifySource(supabase, item)
  if (sourceProblem) return { ...base, status: 'skipped', message: sourceProblem }

  const existing = await getDraftState(supabase, item)
  if (existing?.issue_status === 'issued') return { ...base, status: 'skipped', message: '이미 발행된 건' }
  if (existing?.issue_status === 'requested') return { ...base, status: 'skipped', message: '이미 요청된 건 (결과 대기 중)' }

  const draft = await upsertDraftSnapshot(supabase, item, supplierId)
  const attempt = (draft.issue_attempts ?? 0) + 1
  const clientRef = buildClientReferenceId(item.source, item.source_id, attempt)
  const claimed = await claimRequested(supabase, draft, attempt, clientRef)
  if (!claimed) return { ...base, status: 'skipped', message: '다른 요청이 먼저 처리 중입니다' }

  try {
    const res = await issueTaxInvoice(request, clientRef)
    await saveIssuanceKey(supabase, clientRef, res.issuanceKey)
    return { ...base, status: 'requested', issuanceKey: res.issuanceKey, clientReferenceId: clientRef, message: '발행 요청 접수' }
  } catch (e) {
    if (e instanceof BoltaApiError && isDefiniteRejection(e)) {
      await markFailed(supabase, clientRef, e.code, e.message)
      return { ...base, status: 'failed', clientReferenceId: clientRef, message: `${e.code}: ${e.message}` }
    }
    const cause = e instanceof Error ? e.message : String(e)
    return resolveUncertain(supabase, clientRef, item, cause)
  }
}

export interface IssueBatchResult {
  results: IssueItemResult[]
  requested: number
  failed: number
  skipped: number
  uncertain: number
}

function summarize(results: IssueItemResult[]): IssueBatchResult {
  const count = (s: IssueItemStatus) => results.filter(r => r.status === s).length
  return { results, requested: count('requested'), failed: count('failed'), skipped: count('skipped'), uncertain: count('uncertain') }
}

/** 선택 건을 순서대로 발행 요청. 한 건의 실패가 다른 건을 막지 않는다. */
export async function issueTaxInvoices(
  supabase: ServiceClient,
  items: IssueItemInput[],
  supplierId: string | null,
): Promise<IssueBatchResult> {
  const results: IssueItemResult[] = []
  for (const item of items) {
    try {
      results.push(await issueOne(supabase, item, supplierId))
    } catch (e) {
      results.push({ source: item.source, source_id: item.source_id, status: 'failed', message: e instanceof Error ? e.message : '처리 실패' })
    }
  }
  return summarize(results)
}

// ── 멈춘 요청 재확인 ─────────────────────────────────────────
export interface RecheckResult {
  source: string
  source_id: string
  outcome: 'confirmed' | 'released' | 'waiting' | 'error'
  message: string
}

/**
 * 'requested' 인데 issuanceKey 가 없는 초안을 상태 조회로 확정한다.
 *  - 접수 기록 있음 → 키 저장 (웹훅 대기)
 *  - 기록 없음 + 요청 후 30분 경과 → failed 로 풀어 재요청 허용
 *  - 기록 없음 + 30분 이내 → 대기
 * 키가 이미 있는 건은 웹훅 대기 중이므로 건드리지 않는다.
 */
export async function recheckRequested(
  supabase: ServiceClient,
  filter: { source: string; source_id: string }[] | null,
  now: Date = new Date(),
): Promise<RecheckResult[]> {
  let q = supabase
    .from('tax_invoice_drafts')
    .select(`source, source_id, ${DRAFT_STATE_COLUMNS}`)
    .eq('issue_status', 'requested')
  if (filter && filter.length > 0) q = q.in('source_id', filter.map(f => f.source_id))
  const { data, error } = await q
  if (error) throw new Error(`초안 조회 실패: ${error.message}`)

  type Row = DraftState & { source: string; source_id: string }
  const results: RecheckResult[] = []
  for (const d of ((data ?? []) as unknown) as Row[]) {
    const base = { source: d.source, source_id: d.source_id }
    if (d.bolta_issuance_key) { results.push({ ...base, outcome: 'waiting', message: '접수됨 · 발행 결과(웹훅) 대기 중' }); continue }
    if (!d.client_reference_id) { results.push({ ...base, outcome: 'error', message: '요청 키가 없어 확인 불가' }); continue }
    try {
      const status = await getIssueStatusByReference(d.client_reference_id)
      if (status) {
        await saveIssuanceKey(supabase, d.client_reference_id, status.issuanceKey)
        results.push({ ...base, outcome: 'confirmed', message: '접수 확인 · 발행 결과 대기 중' })
        continue
      }
      const age = now.getTime() - new Date(d.requested_at ?? now).getTime()
      if (age >= RECHECK_RELEASE_AFTER_MS) {
        await markFailed(supabase, d.client_reference_id, 'NO_RECORD', '볼타에 접수 기록 없음 — 재요청 가능')
        results.push({ ...base, outcome: 'released', message: '접수 기록 없음 → 재요청 가능으로 전환' })
      } else {
        results.push({ ...base, outcome: 'waiting', message: '접수 기록 없음 · 30분 후 다시 확인' })
      }
    } catch (e) {
      results.push({ ...base, outcome: 'error', message: e instanceof Error ? e.message : '조회 실패' })
    }
  }
  return results
}
