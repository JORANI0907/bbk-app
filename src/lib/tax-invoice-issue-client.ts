/**
 * 세금계산서 발행 — 브라우저(관리자 화면) 공용 호출 함수
 *
 * 고객관리 탭의 홈택스 모달과 세금계산서 탭의 발행 방식 모달이 같은 함수를 쓴다.
 *  - fetchBoltaMode        볼타 키 상태 (test / live / none)
 *  - saveHometaxCsv        CSV 생성 → Google Sheets 저장, 실패 시 로컬 다운로드 (기존 동작)
 *  - requestBoltaIssue     볼타 발행 요청
 *  - recheckBoltaRequested '요청됨'으로 멈춘 건 상태 재확인
 */

import { buildHometaxCsv, type HometaxRow } from '@/lib/hometax-csv'
import type { IssueBatchResult, RecheckResult } from '@/lib/tax-invoice-issue'

export type BoltaMode = 'test' | 'live' | 'none'

export interface BoltaIssueClientItem {
  source: 'application' | 'billing'
  source_id: string
  customer_id: string | null
  row: HometaxRow
}

export type CsvSaveResult =
  | { ok: true; count: number; webViewLink: string | null }
  | { ok: false; count: number; downloaded: true; error: string }

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({})) as Promise<Record<string, unknown>>
}

export async function fetchBoltaMode(): Promise<BoltaMode> {
  try {
    const res = await fetch('/api/admin/tax-invoice/issue')
    const json = await readJson(res)
    const mode = json.mode
    return mode === 'test' || mode === 'live' ? mode : 'none'
  } catch {
    return 'none'
  }
}

function downloadCsvLocally(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/** CSV 생성 자체가 실패하면 throw. 업로드 실패는 로컬 다운로드로 대체하고 ok:false 반환 */
export async function saveHometaxCsv(rows: HometaxRow[], todayYmd: string): Promise<CsvSaveResult> {
  const csv = buildHometaxCsv(rows)
  const filename = `홈택스_세금계산서_${todayYmd}_${rows.length}건.csv`
  try {
    const res = await fetch('/api/admin/tax-invoice/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, csv }),
    })
    const json = await readJson(res)
    if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : '업로드 실패')
    return { ok: true, count: rows.length, webViewLink: typeof json.webViewLink === 'string' ? json.webViewLink : null }
  } catch (e) {
    downloadCsvLocally(csv, filename)
    return { ok: false, count: rows.length, downloaded: true, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function requestBoltaIssue(
  items: BoltaIssueClientItem[],
  supplierId: string | null,
): Promise<IssueBatchResult & { mode: BoltaMode }> {
  const res = await fetch('/api/admin/tax-invoice/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplier_id: supplierId, items }),
  })
  const json = await readJson(res)
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : '발행 요청 실패')
  return json as unknown as IssueBatchResult & { mode: BoltaMode }
}

export async function recheckBoltaRequested(
  items: { source: string; source_id: string }[],
): Promise<RecheckResult[]> {
  const res = await fetch('/api/admin/tax-invoice/issue', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const json = await readJson(res)
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : '상태 확인 실패')
  return (json.results as RecheckResult[] | undefined) ?? []
}

/** 발행 요청 결과 요약 문구 (토스트용) */
export function summarizeIssueResult(r: IssueBatchResult): string {
  const parts = [`접수 ${r.requested}건`]
  if (r.failed) parts.push(`실패 ${r.failed}건`)
  if (r.uncertain) parts.push(`확인 필요 ${r.uncertain}건`)
  if (r.skipped) parts.push(`건너뜀 ${r.skipped}건`)
  return parts.join(' · ')
}
