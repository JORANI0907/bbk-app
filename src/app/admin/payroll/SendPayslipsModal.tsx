'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { X, ChevronDown, ChevronUp, Check, Send, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui'
import type { PayslipEntry } from './PayslipList'

/**
 * 이미 발행된 명세서 재발송 모달
 * - 상단 "명세서 발송" 버튼 → 이 모달
 * - 각 인원 카드 → 토글 열기 → 발행 이력 리스트 → 하나 선택 → "적용완료" 배지
 * - 모든 인원 선택 완료 후 "발송" → send-existing API
 */

interface Props {
  month: string
  displayMonth: string
  selectedPersons: string[]              // ["user:uuid", "worker:uuid", ...]
  personNames: Record<string, string>    // key -> name 매핑 (page.tsx에서 전달)
  onClose: () => void
  onSent: () => void
}

interface PersonRow {
  key: string
  personType: 'user' | 'worker'
  personId: string
  personName: string
}

function parsePersons(keys: string[], names: Record<string, string>): PersonRow[] {
  return keys.map(k => {
    const [type, ...rest] = k.split(':')
    const id = rest.join(':')
    return {
      key: k,
      personType: type as 'user' | 'worker',
      personId: id,
      personName: names[k] ?? '(이름 없음)',
    }
  })
}

export default function SendPayslipsModal({
  month, displayMonth, selectedPersons, personNames, onClose, onSent,
}: Props) {
  const persons = parsePersons(selectedPersons, personNames)

  const [payslips, setPayslips] = useState<PayslipEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  // key(person key) → 선택된 payslipId
  const [selectedByKey, setSelectedByKey] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll/payslips?year_month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      setPayslips(json.payslips ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '발행 이력 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { void load() }, [load])

  // 인원별 이력 그룹핑
  const payslipsForPerson = (p: PersonRow): PayslipEntry[] =>
    payslips
      .filter(x => x.person_type === p.personType && x.person_id === p.personId)
      .sort((a, b) => (b.issued_at ?? '').localeCompare(a.issued_at ?? ''))

  const toggleExpand = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key))
  }

  const selectPayslip = (personKey: string, payslipId: string) => {
    setSelectedByKey(prev => ({ ...prev, [personKey]: payslipId }))
  }

  const clearSelection = (personKey: string) => {
    setSelectedByKey(prev => {
      const next = { ...prev }
      delete next[personKey]
      return next
    })
  }

  const selectedCount = Object.keys(selectedByKey).length
  const totalCount = persons.length

  const handleSend = async () => {
    if (selectedCount === 0) {
      toast.error('발송할 명세서를 선택하세요.')
      return
    }
    setSending(true)
    setProgress(0)
    try {
      const items = Object.values(selectedByKey).map(payslipId => ({ payslipId }))
      const res = await fetch('/api/admin/payroll/payslips/send-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '발송 실패')

      type R = { personName: string; smsSent: boolean; emailSent: boolean; skippedReason?: string; error?: string }
      const results: R[] = json.results ?? []
      const smsCount = results.filter(r => r.smsSent).length
      const emailCount = results.filter(r => r.emailSent).length
      const skipped = results.filter(r => r.skippedReason)
      const errored = results.filter(r => r.error && !r.skippedReason)

      let msg = `SMS ${smsCount}건 · 이메일 ${emailCount}건 발송 완료`
      if (skipped.length > 0) msg += `\n건너뜀: ${skipped.map(r => `${r.personName}(${r.skippedReason})`).join(', ')}`
      if (errored.length > 0) msg += `\n실패: ${errored.map(r => `${r.personName}(${r.error})`).join(', ')}`

      if (skipped.length === 0 && errored.length === 0) toast.success(msg)
      else toast.error(msg, { duration: 8000 })

      onSent()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '발송 실패')
    } finally {
      setSending(false)
      setProgress(0)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border-subtle shrink-0">
          <h3 className="font-bold text-text-primary text-base flex items-center gap-1.5">
            <Send size={16} className="text-brand-600" />
            명세서 발송
          </h3>
          <p className="text-xs text-text-tertiary mt-1">
            <span className="font-semibold text-brand-600">{displayMonth}</span> · {totalCount}명 선택
            {selectedCount > 0 && (
              <span className="ml-2 text-emerald-600 font-semibold">· 선택 완료 {selectedCount}/{totalCount}</span>
            )}
          </p>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <p className="text-sm text-text-tertiary text-center py-6">발행 이력 조회 중...</p>
          ) : persons.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-6">선택된 인원이 없습니다.</p>
          ) : (
            persons.map(p => {
              const ps = payslipsForPerson(p)
              const isExpanded = expandedKey === p.key
              const selectedId = selectedByKey[p.key]
              const selectedPayslip = ps.find(x => x.id === selectedId)
              const hasHistory = ps.length > 0

              return (
                <div
                  key={p.key}
                  className={`rounded-xl border transition-colors ${
                    selectedId ? 'border-emerald-300 bg-emerald-50/40' : 'border-border-subtle'
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(p.key)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-sunken transition-colors rounded-xl"
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.personType === 'user' ? 'bg-brand-600 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {p.personType === 'user' ? '담당자' : '작업자'}
                    </span>
                    <span className="text-sm font-semibold text-text-primary flex-1 text-left">
                      {p.personName}
                    </span>
                    {selectedId ? (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                        <Check size={11} />
                        {selectedPayslip
                          ? `${new Date(selectedPayslip.issued_at ?? '').toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} 발행분`
                          : '적용완료'}
                      </span>
                    ) : hasHistory ? (
                      <span className="text-[11px] text-text-tertiary">이력 {ps.length}건</span>
                    ) : (
                      <span className="text-[11px] text-red-500 flex items-center gap-0.5">
                        <AlertCircle size={11} />이력 없음
                      </span>
                    )}
                    {isExpanded ? <ChevronUp size={15} className="text-text-tertiary" /> : <ChevronDown size={15} className="text-text-tertiary" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-subtle px-3 py-2 space-y-1.5">
                      {!hasHistory ? (
                        <p className="text-xs text-text-tertiary text-center py-3">
                          이 인원의 {displayMonth} 발행 이력이 없습니다.
                          <br />
                          <span className="text-[11px]">먼저 &quot;명세서 발행&quot; 을 진행하세요.</span>
                        </p>
                      ) : (
                        ps.map(x => {
                          const isChecked = selectedId === x.id
                          const canSend = !!x.storage_path
                          const issued = x.issued_at ? new Date(x.issued_at).toLocaleString('ko-KR', {
                            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                          }) : '-'
                          return (
                            <label
                              key={x.id}
                              className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition ${
                                !canSend
                                  ? 'border-red-200 bg-red-50/40 opacity-60 cursor-not-allowed'
                                  : isChecked
                                    ? 'border-emerald-400 bg-emerald-50'
                                    : 'border-border-subtle bg-surface hover:bg-surface-sunken'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`payslip-${p.key}`}
                                checked={isChecked}
                                disabled={!canSend}
                                onChange={() => canSend && selectPayslip(p.key, x.id)}
                                className="mt-0.5 accent-emerald-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <FileText size={11} className="text-brand-600 shrink-0" />
                                  <span className="text-xs font-semibold text-text-primary truncate">
                                    {x.file_name ?? `급여명세서_${p.personName}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-tertiary">
                                  <span>발행 {issued}</span>
                                  <span>· 실지급 {x.net_amount.toLocaleString('ko-KR')}원</span>
                                  {x.sent_sms_at && <span className="text-emerald-600">· SMS✓</span>}
                                  {x.sent_email_at && <span className="text-emerald-600">· 이메일✓</span>}
                                </div>
                                {!canSend && (
                                  <p className="text-[10px] text-red-600 mt-1">
                                    ⚠ 이전 방식으로 발행되어 재발송 불가. 새로 발행해주세요.
                                  </p>
                                )}
                              </div>
                            </label>
                          )
                        })
                      )}

                      {selectedId && (
                        <button
                          onClick={() => clearSelection(p.key)}
                          className="w-full text-[11px] text-text-tertiary hover:text-red-600 py-1"
                        >
                          선택 해제
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* 진행률 */}
        {sending && (
          <div className="px-4 py-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-text-secondary">발송 중...</span>
              <span className="font-semibold text-brand-600">{progress} / {selectedCount}</span>
            </div>
            <div className="w-full bg-surface-sunken rounded-full h-1.5 overflow-hidden">
              <div className="bg-brand-600 h-full transition-all" style={{ width: `${selectedCount ? (progress / selectedCount) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {/* 액션 */}
        <div className="px-4 py-3 border-t border-border-subtle flex gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken disabled:opacity-60"
          >
            취소
          </button>
          <Button
            onClick={handleSend}
            disabled={sending || selectedCount === 0}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            <Send size={13} />
            {sending ? '발송 중...' : `${selectedCount}건 발송`}
          </Button>
        </div>
      </div>
    </div>
  )
}
