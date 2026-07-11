'use client'

import { useState, useEffect, type ReactElement } from 'react'
import toast from 'react-hot-toast'
import { Folder, FileText, CheckCircle, XCircle, Send, RefreshCw, ExternalLink } from 'lucide-react'
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

// 발행 상태 (인원별)
type PublishStatus =
  | { state: 'pending' }
  | { state: 'processing' }
  | { state: 'success'; fileName: string; fileUrl: string | null; data: PayslipData }
  | { state: 'error'; message: string }

// 기본 지급일: 다음 달 10일
function defaultPayDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 10)  // (y, m-1+1, 10) → 다음 달 10일
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

// selectedPersons 문자열 배열을 { type, id, key } 배열로 파싱
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
}: {
  month: string
  displayMonth: string
  selectedPersons: string[]  // "user:xxx" 또는 "worker:xxx"
  onClose: () => void
}) {
  const persons = parsePersons(selectedPersons)

  const [payDate, setPayDate] = useState(defaultPayDate(month))
  const [incomeTax, setIncomeTax] = useState('0')
  const [folder, setFolder] = useState<DriveFolder | null>(null)
  const [folderLoading, setFolderLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)

  // 발행 진행 상태 (key 별)
  const [statuses, setStatuses] = useState<Record<string, PublishStatus>>(() =>
    Object.fromEntries(persons.map(p => [p.key, { state: 'pending' as const }]))
  )
  const [publishing, setPublishing] = useState(false)
  const [publishedAny, setPublishedAny] = useState(false)

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

  const publishOne = async (
    person: { type: 'user' | 'worker'; id: string; key: string },
    token: string | null,
  ): Promise<void> => {
    setStatuses(prev => ({ ...prev, [person.key]: { state: 'processing' } }))
    try {
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

      // 2. PDF 생성 (동적 import로 초기 번들 줄임)
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

      setStatuses(prev => ({
        ...prev,
        [person.key]: { state: 'success', fileName, fileUrl, data: payslipData },
      }))
    } catch (err) {
      setStatuses(prev => ({
        ...prev,
        [person.key]: { state: 'error', message: err instanceof Error ? err.message : '발행 실패' },
      }))
    }
  }

  const handlePublishAll = async () => {
    setPublishing(true)
    try {
      // Drive 폴더가 있으면 사전에 토큰 확보 (사용자에게 여러 번 인증창 뜨는 것 방지)
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

      // 순차 처리 — 대량이면 병렬로 바꾸는 게 유리하지만 지금은 순차로 진행률 명확히
      for (const p of persons) {
        await publishOne(p, token)
      }
      setPublishedAny(true)
      toast.success('발행이 완료되었습니다. 검수 후 발송 버튼을 눌러주세요.')
    } finally {
      setPublishing(false)
    }
  }

  const handleRetry = async (person: { type: 'user' | 'worker'; id: string; key: string }) => {
    await publishOne(person, accessToken)
  }

  const handleSend = (person: { type: 'user' | 'worker'; id: string; key: string }, status: PublishStatus) => {
    if (status.state !== 'success') return
    // 발송 기능은 자리만 만들어놓고, 실제 발송은 추후 SMS/카카오/이메일 연동 시 구현
    toast('발송 기능은 준비 중입니다. (이번 릴리즈에서는 발행까지만 지원)', { icon: '📮' })
  }

  const doneCount = Object.values(statuses).filter(s => s.state === 'success').length
  const failCount = Object.values(statuses).filter(s => s.state === 'error').length
  const totalCount = persons.length

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget && !publishing) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg my-8 max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-5 border-b border-border-subtle">
          <h3 className="font-bold text-text-primary text-base mb-1 flex items-center gap-1.5">
            <FileText size={16} className="text-indigo-600" />
            급여명세서 발행
          </h3>
          <p className="text-xs text-text-tertiary">
            <span className="font-semibold text-indigo-600">{displayMonth}</span> · {totalCount}명 선택
          </p>
        </div>

        {/* 본문 스크롤 */}
        <div className="flex-1 overflow-y-auto p-5">
          {!publishedAny ? (
            <>
              {/* 발행 옵션 */}
              <div className="space-y-4 mb-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1.5">지급일</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1.5">
                    소득세 (4대보험 인원에게만 적용)
                    <span className="ml-1 text-text-tertiary">근로소득 간이세액표 참조</span>
                  </label>
                  <input
                    type="number"
                    value={incomeTax}
                    onChange={e => setIncomeTax(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-text-tertiary mt-1">
                    ※ 프리랜서 3.3% 인원은 이 값과 무관하게 사업소득세 자동 계산됩니다.
                  </p>
                </div>

                {/* Drive 폴더 */}
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-1.5">저장 위치 (Google Drive)</p>
                  {folderLoading ? (
                    <div className="h-11 rounded-xl bg-surface-sunken animate-pulse" />
                  ) : folder ? (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-state-success-bg rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder size={16} className="shrink-0" />
                        <span className="text-sm font-semibold text-state-success truncate">{folder.name}</span>
                      </div>
                      <button
                        onClick={handleSelectFolder}
                        disabled={selecting}
                        className="text-xs text-text-tertiary hover:text-brand-600 ml-2 shrink-0 disabled:opacity-40"
                      >
                        {selecting ? '선택 중...' : '변경'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleSelectFolder}
                      disabled={selecting}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-secondary hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
                    >
                      <Folder size={16} />
                      <span>{selecting ? 'Google 폴더 선택 중...' : 'Google Drive 폴더 선택'}</span>
                    </button>
                  )}
                  {!folder && !folderLoading && (
                    <p className="text-[11px] text-text-tertiary mt-1.5">
                      폴더 미설정 시 각 인원 PDF가 로컬에 순차 다운로드됩니다.
                    </p>
                  )}
                </div>
              </div>

              {/* 선택된 인원 리스트 */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">발행 대상 ({totalCount}명)</p>
                <div className="max-h-40 overflow-y-auto border border-border-subtle rounded-lg divide-y divide-border-subtle">
                  {persons.map(p => (
                    <div key={p.key} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-text-primary font-medium">{p.type === 'user' ? '👤' : '🧰'} {p.id.slice(0, 8)}...</span>
                      <span className="text-text-tertiary">{p.type === 'user' ? '담당자' : '작업자'}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-text-tertiary mt-1">
                  ※ 발행 시점의 급여유형(직원관리 탭 설정)에 따라 4대보험 / 프리랜서3.3% / 없음으로 자동 계산됩니다.
                </p>
              </div>
            </>
          ) : (
            /* 발행 완료 결과 화면 */
            <div>
              <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                <p className="text-sm font-semibold text-indigo-800">
                  발행 완료: {doneCount}/{totalCount}건
                  {failCount > 0 && <span className="text-red-600 ml-2">· 실패 {failCount}건</span>}
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  각 인원 PDF를 확인 후 <span className="font-bold">발송</span> 버튼을 눌러주세요. (발송 기능은 준비 중)
                </p>
              </div>

              <div className="space-y-2">
                {persons.map(p => {
                  const status = statuses[p.key]
                  return (
                    <div key={p.key} className="border border-border-subtle rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {status.state === 'success' && <CheckCircle size={14} className="text-emerald-600" />}
                          {status.state === 'error' && <XCircle size={14} className="text-red-600" />}
                          {status.state === 'processing' && <RefreshCw size={14} className="text-indigo-600 animate-spin" />}
                          <span className="text-sm font-semibold text-text-primary">
                            {status.state === 'success' ? status.data.person.name : `${p.type === 'user' ? '담당자' : '작업자'} ${p.id.slice(0, 8)}`}
                          </span>
                          {status.state === 'success' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                              {status.data.person.taxType}
                            </span>
                          )}
                        </div>
                        {status.state === 'success' && (
                          <span className="text-xs font-bold text-emerald-700">
                            {status.data.netPay.toLocaleString('ko-KR')}원
                          </span>
                        )}
                      </div>

                      {status.state === 'success' && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {status.fileUrl && (
                            <a
                              href={status.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 px-2 py-1 border border-brand-200 rounded-md"
                            >
                              <ExternalLink size={11} />
                              PDF 열기
                            </a>
                          )}
                          <button
                            onClick={() => handleSend(p, status)}
                            className="flex-1 flex items-center justify-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md font-medium"
                          >
                            <Send size={11} />
                            발송
                          </button>
                        </div>
                      )}

                      {status.state === 'error' && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-red-600 flex-1 truncate">{status.message}</span>
                          <button
                            onClick={() => handleRetry(p)}
                            className="text-xs text-brand-600 hover:text-brand-700 px-2 py-0.5"
                          >
                            재시도
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 푸터: 액션 버튼 */}
        <div className="p-4 border-t border-border-subtle flex gap-2 bg-surface">
          <button
            onClick={onClose}
            disabled={publishing}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken disabled:opacity-60"
          >
            {publishedAny ? '닫기' : '취소'}
          </button>
          {!publishedAny && (
            <Button
              onClick={handlePublishAll}
              disabled={publishing || folderLoading || totalCount === 0}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
            >
              {publishing
                ? `발행 중... (${Object.values(statuses).filter(s => s.state !== 'pending').length}/${totalCount})`
                : `${totalCount}명 발행`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
