'use client'

import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  GOOGLE_CLIENT_ID,
  GOOGLE_API_KEY,
} from '@/lib/googleDrive'
import type { ParsedRow } from '@/app/api/admin/finance/import-sheet/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  month: string
  onClose: () => void
  onImported: () => void
}

const CATEGORY_LABEL: Record<string, string> = { fixed: '고정비', variable: '변동비' }
const CATEGORY_COLOR: Record<string, string> = {
  fixed: 'bg-indigo-100 text-indigo-700',
  variable: 'bg-purple-100 text-purple-700',
}

// ─── Google Drive File Picker ─────────────────────────────────────────────────

async function openSheetPicker(): Promise<{ id: string; name: string; mimeType: string } | null> {
  await loadGoogleAPIs()
  const accessToken = await requestGoogleToken()

  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const view = new g.picker.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes(
        [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.google-apps.spreadsheet',
        ].join(',')
      )
      .setEnableDrives(true)

    const builder = new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setTitle('카드사용내역 파일 선택')
      .setCallback((data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => {
        if (data.action === 'picked' && data.docs?.[0]) resolve(data.docs[0])
        else if (data.action === 'cancel') resolve(null)
      })

    if (GOOGLE_API_KEY) builder.setDeveloperKey(GOOGLE_API_KEY)
    builder.build().setVisible(true)
  })
}

async function downloadDriveFile(fileId: string, mimeType: string, accessToken: string): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const isGoogleSheet = mimeType === 'application/vnd.google-apps.spreadsheet'
  const url = isGoogleSheet
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error('구글 드라이브 파일 다운로드 실패')
  const buffer = await res.arrayBuffer()
  const ext = isGoogleSheet ? '.xlsx' : ''
  return { buffer, fileName: `drive-file${ext}` }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportSheetModal({ month, onClose, onImported }: Props) {
  const [step, setStep] = useState<'select' | 'preview' | 'saving'>('select')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const parseFile = useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    setLoadingMsg('AI로 분류 중... (수초 소요)')
    const blob = new Blob([buffer])
    const file = new File([blob], fileName)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('month', month)

    const res = await fetch('/api/admin/finance/import-sheet', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '파싱 실패')
    return json.rows as ParsedRow[]
  }, [month])

  // 로컬 파일 업로드
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setLoadingMsg('파일 분석 중...')
    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseFile(buffer, file.name)
      setRows(parsed)
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파싱 실패')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  // 구글 드라이브에서 선택
  const handleDrivePick = async () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error('Google 연동이 설정되지 않았습니다.')
      return
    }
    setLoading(true)
    setLoadingMsg('Google 드라이브 연결 중...')
    try {
      const picked = await openSheetPicker()
      if (!picked) { setLoading(false); setLoadingMsg(''); return }

      setLoadingMsg('파일 다운로드 중...')
      const accessToken = await requestGoogleToken()
      const { buffer, fileName } = await downloadDriveFile(picked.id, picked.mimeType, accessToken)
      const parsed = await parseFile(buffer, picked.name || fileName)
      setRows(parsed)
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '불러오기 실패')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  // 행 토글
  const toggleRow = (idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, include: !r.include } : r))

  const toggleAll = (val: boolean) =>
    setRows(prev => prev.map(r => ({ ...r, include: val })))

  // 카테고리 변경
  const changeCategory = (idx: number, category: 'fixed' | 'variable') =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category } : r))

  // 항목명 변경
  const changeName = (idx: number, name: string) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, name } : r))

  // 저장
  const handleSave = async () => {
    const toSave = rows.filter(r => r.include)
    if (toSave.length === 0) { toast.error('선택된 항목이 없습니다.'); return }

    setStep('saving')
    try {
      const res = await fetch('/api/admin/finance/bulk-insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          items: toSave.map(r => ({
            category: r.category,
            name: r.name,
            amount: Math.round(r.amount),
            note: r.merchant !== r.name ? r.merchant : null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${json.inserted}건 저장되었습니다.`)
      onImported()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
      setStep('preview')
    }
  }

  const includedCount = rows.filter(r => r.include).length
  const fmt = (n: number) => n.toLocaleString('ko-KR')

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-modal max-h-[90vh] flex flex-col">

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">카드내역 불러오기</h2>
            <p className="text-xs text-text-tertiary mt-0.5">{displayMonth} 고정비·변동비 자동 분류</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-sunken text-text-tertiary transition-colors">✕</button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto">

          {/* Step 1: 파일 선택 */}
          {step === 'select' && (
            <div className="p-5 space-y-4">
              {loading ? (
                <div className="text-center py-10">
                  <div className="text-2xl mb-3 animate-spin inline-block">⚙️</div>
                  <p className="text-sm text-text-secondary">{loadingMsg}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-text-secondary">카드사용내역 파일을 선택하세요.</p>
                  <p className="text-xs text-text-tertiary">지원 형식: 일시불+할부_카드이용내역조회.xlsx / 승인내역조회.xls</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleDrivePick}
                      className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-border rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-colors active:scale-[0.98]"
                    >
                      <span className="text-3xl">☁️</span>
                      <span className="text-sm font-semibold text-text-primary">구글 드라이브에서 선택</span>
                      <span className="text-xs text-text-tertiary text-center">저장해둔 폴더에서 직접 불러오기</span>
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-border rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-colors active:scale-[0.98]"
                    >
                      <span className="text-3xl">📂</span>
                      <span className="text-sm font-semibold text-text-primary">로컬 파일 업로드</span>
                      <span className="text-xs text-text-tertiary text-center">다운로드한 파일 직접 선택</span>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </>
              )}
            </div>
          )}

          {/* Step 2: 미리보기 */}
          {(step === 'preview' || step === 'saving') && (
            <div className="flex flex-col">
              {/* 요약 바 */}
              <div className="px-5 py-3 bg-surface-sunken border-b border-border-subtle flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-text-secondary">총 {rows.length}건</span>
                <span className="text-xs text-text-secondary">·</span>
                <span className="text-xs font-semibold text-text-primary">선택 {includedCount}건</span>
                <span className="text-xs text-text-secondary ml-auto">
                  합계 {fmt(rows.filter(r => r.include).reduce((s, r) => s + r.amount, 0))}원
                </span>
              </div>

              {/* 전체 선택 */}
              <div className="px-5 py-2 border-b border-border-subtle flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rows.every(r => r.include)}
                    onChange={e => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-text-secondary">전체 선택</span>
                </label>
              </div>

              {/* 행 목록 */}
              <div className="divide-y divide-border-subtle">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`px-4 py-3 flex items-start gap-3 ${!row.include ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={() => toggleRow(idx)}
                      className="mt-0.5 rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text-tertiary">{row.date}</span>
                        <span className="text-sm font-medium text-text-primary truncate">{row.merchant}</span>
                        {row.industry && (
                          <span className="text-xs text-text-tertiary">{row.industry}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={row.category}
                          onChange={e => changeCategory(idx, e.target.value as 'fixed' | 'variable')}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 ${CATEGORY_COLOR[row.category]}`}
                        >
                          <option value="fixed">고정비</option>
                          <option value="variable">변동비</option>
                        </select>
                        <input
                          value={row.name}
                          onChange={e => changeName(idx, e.target.value)}
                          maxLength={20}
                          className="flex-1 text-xs border border-border rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-[80px]"
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-text-primary font-mono flex-shrink-0">
                      {fmt(row.amount)}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        {(step === 'preview' || step === 'saving') && (
          <div className="px-5 py-4 border-t border-border-subtle flex items-center gap-3 flex-shrink-0">
            <Button variant="ghost" onClick={() => setStep('select')} size="sm" className="flex-shrink-0">
              다시 선택
            </Button>
            <Button
              onClick={handleSave}
              disabled={step === 'saving' || includedCount === 0}
              className="flex-1"
            >
              {step === 'saving' ? '저장 중...' : `${includedCount}건 저장`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
