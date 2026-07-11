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
   * 실패 시 throw
   */
  const publishOne = async (
    person: { type: 'user' | 'worker'; id: string; key: string },
    token: string | null,
  ): Promise<void> => {
    // 1. 데이터 조회
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
    const payslipData: PayslipData = dataJson.data

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
    } else {
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
  }

  const handlePublishAll = async () => {
    setPublishing(true)
    setProgress(0)
    let successCount = 0
    let failCount = 0
    const failNames: string[] = []

    try {
      // Drive 폴더가 있으면 사전에 토큰 확보
      let token = accessToken
      if (folder && !token) {
        try {
          await loadGoogleAPIs()
          token = await requestGoogleToken()
          setAccessToken(token)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Google 인증 실패')
          setPublishing(false)
          return
        }
      }

      // 순차 발행 — 진행률 표시
      for (const p of persons) {
        try {
          await publishOne(p, token)
          successCount++
        } catch (err) {
          failCount++
          failNames.push(`${p.type === 'user' ? '담당자' : '작업자'} ${p.id.slice(0, 6)} (${err instanceof Error ? err.message : '실패'})`)
        }
        setProgress(v => v + 1)
      }

      // 완료 알림 + 부모에게 알림 → 카드가 새 명세서 리스트를 fetch
      if (successCount > 0 && failCount === 0) {
        toast.success(`${successCount}건 발행 완료`)
      } else if (successCount > 0 && failCount > 0) {
        toast.error(`발행 완료: ${successCount}건 / 실패: ${failCount}건\n실패: ${failNames.join(', ')}`, { duration: 6000 })
      } else {
        toast.error(`전체 발행 실패: ${failNames.join(', ')}`, { duration: 6000 })
      }

      // 부모에게 완료 이벤트 → 카드 리스트 갱신
      onPublished()
      // 자동 닫기 (성공 케이스만) — 실패가 있어도 사용자가 알림을 통해 인지했으므로 닫음
      onClose()
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !publishing) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-text-primary text-base mb-1 flex items-center gap-1.5">
          <FileText size={16} className="text-indigo-600" />
          급여명세서 발행
        </h3>
        <p className="text-xs text-text-tertiary mb-4">
          <span className="font-semibold text-indigo-600">{displayMonth}</span> · {persons.length}명
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
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-border rounded-lg text-xs text-text-secondary hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
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
              <span className="font-semibold text-indigo-600">
                {progress} / {persons.length}
              </span>
            </div>
            <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{ width: `${(progress / persons.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 액션 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={publishing}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken disabled:opacity-60"
          >
            취소
          </button>
          <Button
            onClick={handlePublishAll}
            disabled={publishing || folderLoading || persons.length === 0}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
          >
            {publishing ? '발행 중...' : `${persons.length}명 발행`}
          </Button>
        </div>
      </div>
    </div>
  )
}
