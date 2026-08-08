'use client'

import { useState, useEffect, type ReactElement } from 'react'
import toast from 'react-hot-toast'
import { Folder, FileText } from 'lucide-react'
import { Button } from '@/components/ui'
import type { DocumentProps } from '@react-pdf/renderer'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
  uploadFileToDrive,
  type DriveFolder,
} from '@/lib/googleDrive'
import type { PayslipData } from './PayslipPDF'

// 기본 지급일: 다음 달 10일
function defaultPayDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 10)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function parsePersons(keys: string[]): { type: 'user' | 'worker'; id: string; key: string }[] {
  return keys.map(k => {
    const [type, ...rest] = k.split(':')
    return { type: type as 'user' | 'worker', id: rest.join(':'), key: k }
  })
}

// 클라이언트에서 실제 이메일 유무 판별 (서버 isValidRealEmail 와 동일 규칙)
function clientHasRealEmail(email: string | null | undefined): email is string {
  if (!email) return false
  if (email.endsWith('@bbkorea.app') || email.endsWith('@bbkorea.co.kr') || email.endsWith('@bbkorea.hq')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
function clientHasPhone(phone: string | null | undefined): phone is string {
  return !!phone && phone.replace(/\D/g, '').length >= 9
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return typeof window === 'undefined' ? Buffer.from(binary, 'binary').toString('base64') : window.btoa(binary)
}

export default function PayslipModal({
  month,
  displayMonth,
  selectedPersons,
  onClose,
  onPublished,
}: {
  month: string
  displayMonth: string
  selectedPersons: string[]
  onClose: () => void
  // 발행 완료 후 카드가 명세서 리스트를 재조회하도록 알림
  onPublished: () => void
}) {
  const persons = parsePersons(selectedPersons)

  const [payDate, setPayDate] = useState(defaultPayDate(month))
  const [incomeTax, setIncomeTax] = useState('0')
  const [folder, setFolder] = useState<DriveFolder | null>(null)
  const [folderLoading, setFolderLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState(0)  // 완료 인원 수

  // ── 발송 옵션 ──────────────────────────────────────────────────────────
  const [sendAfterPublish, setSendAfterPublish] = useState(false)
  const [preflight, setPreflight] = useState<null | {
    withEmail: { key: string; name: string; email: string; phone: string | null }[]
    smsOnly: { key: string; name: string; phone: string | null }[]
    none: { key: string; name: string }[]
    payslipsByKey: Record<string, PayslipData>
  }>(null)
  const [confirmingSend, setConfirmingSend] = useState(false)

  useEffect(() => {
    fetch('/api/admin/payroll/drive-folder')
      .then(r => r.json())
      .then(d => setFolder(d.folder ?? null))
      .catch(() => {})
      .finally(() => setFolderLoading(false))
  }, [])

  const handleSelectFolder = async () => {
    setSelecting(true)
    try {
      await loadGoogleAPIs()
      const token = await requestGoogleToken()
      setAccessToken(token)
      const picked = await openFolderPicker(token)
      if (!picked) return
      const resolved = await resolveFolder(picked, token)
      const res = await fetch('/api/admin/payroll/drive-folder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: resolved }),
      })
      if (!res.ok) throw new Error('폴더 저장 실패')
      setFolder(resolved)
      toast.success(`저장 위치 설정됨: ${resolved.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '폴더 선택 실패')
    } finally {
      setSelecting(false)
    }
  }

  /**
   * 한 명의 급여명세서를 발행: 데이터 조회 → PDF 생성 → Drive 업로드/로컬 다운로드 → payslips 테이블 저장
   * 실패 시 throw · 발송용 PDF base64를 옵션으로 반환
   */
  const publishOne = async (
    person: { type: 'user' | 'worker'; id: string; key: string },
    token: string | null,
    opts?: { cachedData?: PayslipData; returnBase64?: boolean },
  ): Promise<{ fileName: string; base64: string | null; data: PayslipData }> => {
    // 1. 데이터 조회 (캐시 있으면 재사용)
    let payslipData: PayslipData
    if (opts?.cachedData) {
      payslipData = opts.cachedData
    } else {
      const dataRes = await fetch('/api/admin/payroll/payslip-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          personType: person.type,
          personId: person.id,
          payDate,
          incomeTax: Number(incomeTax) || 0,
        }),
      })
      const dataJson = await dataRes.json()
      if (!dataRes.ok || !dataJson.success) {
        throw new Error(dataJson.error ?? '데이터 조회 실패')
      }
      payslipData = dataJson.data
    }

    // 2. PDF 생성
    const [{ pdf }, { createElement }, { PayslipPDFDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('./PayslipPDF'),
    ])
    const elem = createElement(PayslipPDFDocument, { data: payslipData }) as ReactElement<DocumentProps>
    const blob = await pdf(elem).toBlob()
    const fileName = `급여명세서_${payslipData.person.name}_${month}.pdf`

    // 3. 저장 (Drive 또는 로컬)
    let fileUrl: string | null = null
    if (folder && token) {
      const file = new File([blob], fileName, { type: 'application/pdf' })
      const uploaded = await uploadFileToDrive(file, folder.id, fileName, token)
      fileUrl = uploaded.fileUrl
    } else if (!opts?.returnBase64) {
      // 발송 모드에서는 자동 다운로드 억제 (사용자가 파일을 100개씩 받게 됨)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    }

    // 4. payroll_payslips 테이블에 저장 (카드에서 조회할 수 있도록)
    const saveRes = await fetch('/api/admin/payroll/payslips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year_month: month,
        person_type: person.type,
        person_id: person.id,
        person_name: payslipData.person.name,
        pay_date: payDate,
        file_url: fileUrl,
        file_name: fileName,
        gross_amount: payslipData.gross.finalAmount,
        deduction_amount: payslipData.deductions.total,
        net_amount: payslipData.netPay,
        tax_type: payslipData.person.taxType,
      }),
    })
    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({}))
      throw new Error(err.error ?? '이력 저장 실패')
    }

    // 5. base64 반환 (발송용)
    let base64: string | null = null
    if (opts?.returnBase64) {
      const buf = await blob.arrayBuffer()
      base64 = arrayBufferToBase64(buf)
    }
    return { fileName, base64, data: payslipData }
  }

  // 발송 모드에서 사전 검증: 각 인원의 이메일/연락처 상태 분류
  const runPreflight = async () => {
    setConfirmingSend(true)
    try {
      const results = await Promise.all(persons.map(async p => {
        const dataRes = await fetch('/api/admin/payroll/payslip-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month, personType: p.type, personId: p.id, payDate, incomeTax: Number(incomeTax) || 0,
          }),
        })
        const dataJson = await dataRes.json()
        if (!dataRes.ok || !dataJson.success) {
          throw new Error(`${p.id.slice(0, 6)}: ${dataJson.error ?? '조회 실패'}`)
        }
        return { key: p.key, data: dataJson.data as PayslipData }
      }))

      const withEmail: { key: string; name: string; email: string; phone: string | null }[] = []
      const smsOnly: { key: string; name: string; phone: string | null }[] = []
      const none: { key: string; name: string }[] = []
      const payslipsByKey: Record<string, PayslipData> = {}

      for (const { key, data } of results) {
        payslipsByKey[key] = data
        const person = data.person
        const hasEmail = clientHasRealEmail(person.email)
        const hasPhone = clientHasPhone(person.phone)
        if (hasEmail) {
          withEmail.push({ key, name: person.name, email: person.email!, phone: person.phone })
        } else if (hasPhone) {
          smsOnly.push({ key, name: person.name, phone: person.phone })
        } else {
          none.push({ key, name: person.name })
        }
      }
      setPreflight({ withEmail, smsOnly, none, payslipsByKey })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '사전 조회 실패')
    } finally {
      setConfirmingSend(false)
    }
  }

  // 실제 발행 + (옵션) 발송
  const runPublishAndSend = async (opts: { sendMode: boolean; cache?: Record<string, PayslipData> }) => {
    setPublishing(true)
    setProgress(0)
    let successCount = 0
    let failCount = 0
    const failNames: string[] = []
    const sendItems: {
      personType: 'user' | 'worker'
      personId: string
      personName: string
      phone: string | null
      email: string | null
      month: string
      fileName: string
      pdfBase64: string
    }[] = []

    try {
      let token = accessToken
      if (folder && !token) {
        try {
          await loadGoogleAPIs()
          token = await requestGoogleToken()
          setAccessToken(token)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Google 인증 실패')
          return
        }
      }

      for (const p of persons) {
        try {
          const { fileName, base64, data } = await publishOne(p, token, {
            cachedData: opts.cache?.[p.key],
            returnBase64: opts.sendMode,
          })
          if (opts.sendMode && base64) {
            sendItems.push({
              personType: p.type,
              personId: p.id,
              personName: data.person.name,
              phone: data.person.phone,
              email: clientHasRealEmail(data.person.email) ? data.person.email : null,
              month, fileName, pdfBase64: base64,
            })
          }
          successCount++
        } catch (err) {
          failCount++
          failNames.push(`${p.type === 'user' ? '담당자' : '작업자'} ${p.id.slice(0, 6)} (${err instanceof Error ? err.message : '실패'})`)
        }
        setProgress(v => v + 1)
      }

      // 발송 (있으면)
      let sentSummary: string | null = null
      if (opts.sendMode && sendItems.length > 0) {
        try {
          const res = await fetch('/api/admin/payroll/payslips/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: sendItems }),
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error ?? '발송 실패')
          const smsCount = json.results.filter((r: { smsSent: boolean }) => r.smsSent).length
          const emailCount = json.results.filter((r: { emailSent: boolean }) => r.emailSent).length
          const errors = json.results.filter((r: { error?: string }) => r.error)
          sentSummary = `SMS ${smsCount}건 · 이메일 ${emailCount}건 발송 완료`
          if (errors.length > 0) {
            sentSummary += ` (실패 ${errors.length}건)`
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : '발송 API 실패')
        }
      }

      // 결과 알림
      const publishMsg = failCount === 0 ? `${successCount}건 발행 완료` : `발행 ${successCount}건 · 실패 ${failCount}건`
      if (sentSummary) toast.success(`${publishMsg}\n${sentSummary}`, { duration: 5000 })
      else if (failCount === 0) toast.success(publishMsg)
      else toast.error(`${publishMsg}\n실패: ${failNames.join(', ')}`, { duration: 6000 })

      onPublished()
      onClose()
    } finally {
      setPublishing(false)
      setPreflight(null)
    }
  }

  const handlePublishAll = async () => {
    if (sendAfterPublish) {
      await runPreflight()
    } else {
      await runPublishAndSend({ sendMode: false })
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !publishing) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-text-primary text-base mb-1 flex items-center gap-1.5">
          <FileText size={16} className="text-brand-600" />
          급여명세서 발행
        </h3>
        <p className="text-xs text-text-tertiary mb-4">
          <span className="font-semibold text-brand-600">{displayMonth}</span> · {persons.length}명
        </p>

        {/* 옵션 */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">지급일</label>
            <input
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
              disabled={publishing}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-surface-sunken"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">
              소득세 (4대보험 인원에만 적용)
            </label>
            <input
              type="number"
              value={incomeTax}
              onChange={e => setIncomeTax(e.target.value)}
              placeholder="0"
              disabled={publishing}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-surface-sunken"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              ※ 프리랜서3.3% 인원은 자동으로 사업소득세 계산됩니다.
            </p>
          </div>

          {/* 발송 옵션 */}
          <label className="flex items-start gap-2 p-3 rounded-lg border border-brand-200 bg-brand-50 cursor-pointer hover:bg-brand-100 transition">
            <input
              type="checkbox"
              checked={sendAfterPublish}
              onChange={e => setSendAfterPublish(e.target.checked)}
              disabled={publishing || confirmingSend}
              className="mt-0.5 accent-brand-600"
            />
            <span className="text-xs text-text-primary leading-snug">
              <span className="font-semibold text-brand-700">📨 발행 후 SMS + 이메일로 자동 발송</span>
              <br />
              <span className="text-text-tertiary">이메일 없는 인원은 SMS만 (발송 전 확인 팝업)</span>
            </span>
          </label>

          {/* Drive 폴더 */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">저장 위치</p>
            {folderLoading ? (
              <div className="h-10 rounded-lg bg-surface-sunken animate-pulse" />
            ) : folder ? (
              <div className="flex items-center justify-between px-3 py-2 bg-state-success-bg rounded-lg">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Folder size={14} className="shrink-0" />
                  <span className="text-xs font-semibold text-state-success truncate">{folder.name}</span>
                </div>
                <button
                  onClick={handleSelectFolder}
                  disabled={selecting || publishing}
                  className="text-[11px] text-text-tertiary hover:text-brand-600 ml-2 shrink-0 disabled:opacity-40"
                >
                  {selecting ? '...' : '변경'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSelectFolder}
                disabled={selecting || publishing}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-border rounded-lg text-xs text-text-secondary hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
              >
                <Folder size={14} />
                <span>{selecting ? '선택 중...' : 'Google Drive 폴더 선택'}</span>
              </button>
            )}
            {!folder && !folderLoading && (
              <p className="text-[11px] text-text-tertiary mt-1">
                폴더 미설정 시 각 PDF가 로컬에 순차 다운로드됩니다.
              </p>
            )}
          </div>
        </div>

        {/* 진행률 (발행 중일 때만) */}
        {publishing && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-text-secondary">발행 진행 중...</span>
              <span className="font-semibold text-brand-600">
                {progress} / {persons.length}
              </span>
            </div>
            <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300"
                style={{ width: `${(progress / persons.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 액션 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={publishing || confirmingSend}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken disabled:opacity-60"
          >
            취소
          </button>
          <Button
            onClick={handlePublishAll}
            disabled={publishing || confirmingSend || folderLoading || persons.length === 0}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
          >
            {publishing ? '발행 중...' : confirmingSend ? '확인 중...' : sendAfterPublish ? `${persons.length}명 발행 및 발송` : `${persons.length}명 발행`}
          </Button>
        </div>
      </div>

      {/* 발송 전 확인 팝업 */}
      {preflight && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-bold text-text-primary mb-1">📨 발송 확인</h3>
            <p className="text-xs text-text-tertiary mb-3">
              총 {persons.length}명 · <span className="font-semibold text-brand-600">{displayMonth}</span>
            </p>

            <div className="space-y-3 text-xs">
              {preflight.withEmail.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="font-semibold text-emerald-800 mb-1">
                    ✓ 이메일 + SMS 발송 ({preflight.withEmail.length}명)
                  </p>
                  <p className="text-emerald-700 leading-snug">
                    {preflight.withEmail.map(x => x.name).join(', ')}
                  </p>
                </div>
              )}

              {preflight.smsOnly.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="font-semibold text-amber-800 mb-1">
                    ⚠️ SMS만 발송 · 이메일 미등록 ({preflight.smsOnly.length}명)
                  </p>
                  <p className="text-amber-700 leading-snug mb-1">
                    {preflight.smsOnly.map(x => x.name).join(', ')}
                  </p>
                  <p className="text-[11px] text-amber-700">
                    이메일 첨부 없이 SMS 다운로드 링크만 전송됩니다. <br />
                    필요 시 <b>직원관리</b> 페이지에서 이메일을 등록 후 다시 시도하세요.
                  </p>
                </div>
              )}

              {preflight.none.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="font-semibold text-red-800 mb-1">
                    ✗ 발송 불가 · 연락처·이메일 모두 없음 ({preflight.none.length}명)
                  </p>
                  <p className="text-red-700 leading-snug">
                    {preflight.none.map(x => x.name).join(', ')}
                  </p>
                  <p className="text-[11px] text-red-700 mt-1">
                    이 인원은 <b>PDF만 저장</b>되고 발송은 건너뜁니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPreflight(null)}
                disabled={publishing}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken disabled:opacity-60"
              >
                취소
              </button>
              <Button
                onClick={() => {
                  const cache = preflight.payslipsByKey
                  setPreflight(null)
                  void runPublishAndSend({ sendMode: true, cache })
                }}
                disabled={publishing}
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
              >
                {publishing ? '발행 중...' : '그대로 발송'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
