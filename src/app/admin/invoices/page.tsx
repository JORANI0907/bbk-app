'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

interface TaxInvoiceTarget {
  application_id: string
  공급자등록번호: string
  공급자상호: string
  공급자대표자: string
  공급자주소: string
  공급자업태: string
  공급자종목: string
  공급받는자등록번호: string
  공급받는자상호: string
  공급받는자대표자: string
  작성일자: string
  공급가액: number
  세액: number
  품목: string
  수량: number
  단가: number
}

interface InvoiceLog {
  id: string
  issued_at: string
  count: number
  file_url: string | null
  issued_by: string | null
  application_ids: string[]
  notes: string | null
  created_at: string
}

interface InvoiceFormData {
  issued_at: string
  count: string
  file_url: string
  notes: string
}

const EMPTY_FORM: InvoiceFormData = {
  issued_at: new Date().toISOString().slice(0, 16),
  count: '',
  file_url: '',
  notes: '',
}

// ─── 유틸 ────────────────────────────────────────────────────────

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

// ─── 유틸 (세금계산서) ───────────────────────────────────────────

function exportTaxInvoiceCSV(targets: TaxInvoiceTarget[]) {
  const headers = [
    '공급자등록번호', '공급자상호', '공급자대표자', '공급자주소',
    '공급자업태', '공급자종목', '공급받는자등록번호', '공급받는자상호',
    '공급받는자대표자', '작성일자', '공급가액', '세액', '품목', '수량', '단가',
  ]
  const rows = targets.map(t => [
    t.공급자등록번호, t.공급자상호, t.공급자대표자, t.공급자주소,
    t.공급자업태, t.공급자종목, t.공급받는자등록번호, t.공급받는자상호,
    t.공급받는자대표자, t.작성일자, t.공급가액, t.세액, t.품목, t.수량, t.단가,
  ])
  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.href = url
  a.download = `세금계산서_발행대상_${today}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [month, setMonth] = useState(getCurrentMonth)
  const [invoices, setInvoices] = useState<InvoiceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<InvoiceFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // 세금계산서 자동화
  const [taxTargets, setTaxTargets] = useState<TaxInvoiceTarget[]>([])
  const [taxPeriod, setTaxPeriod] = useState<{ from: string; to: string } | null>(null)
  const [taxLoading, setTaxLoading] = useState(false)
  const [taxChecked, setTaxChecked] = useState(false)

  const fetchTaxTargets = useCallback(async () => {
    setTaxLoading(true)
    try {
      const res = await fetch('/api/admin/tax-invoice-auto', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '조회 실패'); return }
      setTaxTargets(json.targets ?? [])
      setTaxPeriod(json.period ?? null)
      setTaxChecked(true)
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setTaxLoading(false)
    }
  }, [])

  const fetchInvoices = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/invoices?month=${m}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setInvoices(json.invoices ?? [])
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInvoices(month) }, [fetchInvoices, month])

  const handleMonthChange = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const openModal = () => {
    setForm({ ...EMPTY_FORM, issued_at: new Date().toISOString().slice(0, 16) })
    setShowModal(true)
  }

  const handleSave = async () => {
    const countNum = parseInt(form.count, 10)
    if (!form.issued_at) { toast.error('발행일을 입력하세요.'); return }
    if (!form.count || isNaN(countNum) || countNum < 1) { toast.error('건수를 올바르게 입력하세요.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issued_at: new Date(form.issued_at).toISOString(),
          count: countNum,
          file_url: form.file_url || null,
          notes: form.notes || null,
          application_ids: [],
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }

      toast.success('발행 기록이 등록되었습니다.')
      setShowModal(false)
      fetchInvoices(month)
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const totalCount = invoices.reduce((sum, inv) => sum + (inv.count || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-gray-900">세금계산서</h1>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
        >
          <span className="text-base leading-none">+</span> 새 발행 기록
        </button>
      </div>

      {/* 세금계산서 자동화 대상 섹션 */}
      <div className="px-4 pb-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold text-amber-800">세금계산서 자동화 대상</p>
              <p className="text-xs text-amber-600 mt-0.5">
                매주 토요일 자동 실행 예정 — 지난주 토~이번주 토 완료건 중 계산서 결제 대상
              </p>
            </div>
            <button
              onClick={fetchTaxTargets}
              disabled={taxLoading}
              className="px-3 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {taxLoading ? '조회 중...' : '이번주 발행 대상 확인'}
            </button>
          </div>

          {taxChecked && (
            <>
              {taxPeriod && (
                <p className="text-xs text-amber-700 mb-2">
                  조회 기간: {taxPeriod.from} ~ {taxPeriod.to} | 총 {taxTargets.length}건
                </p>
              )}
              {taxTargets.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">이번 주 발행 대상이 없습니다.</p>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-amber-100 overflow-hidden mb-2">
                    <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-amber-100 text-xs font-semibold text-amber-700">
                      <span>업체명</span>
                      <span>대표자</span>
                      <span className="text-right">공급가액</span>
                      <span className="text-right">세액</span>
                    </div>
                    {taxTargets.map(t => (
                      <div key={t.application_id} className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-amber-50 text-xs">
                        <span className="text-gray-800 font-medium truncate">{t.공급받는자상호}</span>
                        <span className="text-gray-600 truncate">{t.공급받는자대표자}</span>
                        <span className="text-right text-gray-800">{t.공급가액.toLocaleString('ko-KR')}원</span>
                        <span className="text-right text-gray-600">{t.세액.toLocaleString('ko-KR')}원</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => exportTaxInvoiceCSV(taxTargets)}
                    className="w-full py-2 bg-green-600 text-white text-xs font-semibold rounded-xl hover:bg-green-700 transition-colors"
                  >
                    구글시트로 내보내기 (CSV — 홈택스 탑재용)
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 월 네비게이터 */}
      <div className="flex items-center gap-3 px-4 pb-3">
        <button
          onClick={() => handleMonthChange(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800 min-w-[90px] text-center">
          {monthLabel(month)}
        </span>
        <button
          onClick={() => handleMonthChange(1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          ›
        </button>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="ml-2 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* 요약 카드 */}
      <div className="px-4 pb-3">
        <div className="bg-brand-50 rounded-xl p-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-brand-600 font-medium">이번 달 총 발행</p>
            <p className="text-2xl font-bold text-brand-700">{totalCount}건</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">발행 횟수</p>
            <p className="text-lg font-semibold text-gray-700">{invoices.length}회</p>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">로딩 중...</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">발행 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
              <span>발행일시</span>
              <span className="text-center">건수</span>
              <span className="text-center">파일</span>
              <span>비고</span>
            </div>
            {/* 테이블 행 */}
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                className={`grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center ${idx !== invoices.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <span className="text-gray-700 text-xs">{formatDateTime(inv.issued_at)}</span>
                <span className="text-center font-semibold text-gray-900">{inv.count}건</span>
                <span className="text-center">
                  {inv.file_url ? (
                    <a
                      href={inv.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline text-xs font-medium"
                    >
                      파일 보기
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">-</span>
                  )}
                </span>
                <span className="text-gray-500 text-xs truncate">{inv.notes || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">새 발행 기록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">발행일시 *</label>
                <input
                  type="datetime-local"
                  value={form.issued_at}
                  onChange={e => setForm(prev => ({ ...prev, issued_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">건수 *</label>
                <input
                  type="number"
                  min={1}
                  value={form.count}
                  onChange={e => setForm(prev => ({ ...prev, count: e.target.value }))}
                  placeholder="발행 건수"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">파일 URL</label>
                <input
                  type="url"
                  value={form.file_url}
                  onChange={e => setForm(prev => ({ ...prev, file_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">비고</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="메모 (선택)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
