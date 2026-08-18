'use client'

import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Button, Modal } from '@/components/ui'
import { Pencil } from 'lucide-react'
import {
  DEFAULT_SMS_TEMPLATE,
  renderSmsBody,
} from '@/lib/workerDocuments'
import { DocumentTypeEditor, type DocumentTypeItem } from './DocumentTypeEditor'

interface Props {
  open: boolean
  onClose: () => void
  workerId: string
  workerName: string
  defaultOtpPhone: string   // 직원 등록 전화번호
  onCreated?: () => void    // 요청 생성 성공 시 (요청 이력 재조회 트리거)
}

interface ItemSelection {
  value: string
  checked: boolean
  customLabel?: string  // is_other 전용
}

const APP_URL =
  typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://app.bbkorea.co.kr'

export function DocumentRequestModal({ open, onClose, workerId, workerName, defaultOtpPhone, onCreated }: Props) {
  const [docTypes, setDocTypes] = useState<DocumentTypeItem[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [selections, setSelections] = useState<ItemSelection[]>([])
  const [otpPhone, setOtpPhone] = useState(defaultOtpPhone)
  const [messageBody, setMessageBody] = useState(DEFAULT_SMS_TEMPLATE)
  const [isSending, setIsSending] = useState(false)

  // 서류 유형 마스터 조회
  const fetchTypes = async () => {
    setLoadingTypes(true)
    try {
      const res = await fetch('/api/admin/worker-document-types')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      const active = (json.types ?? []).filter((t: DocumentTypeItem) => t.is_active !== false)
      setDocTypes(active)
      setSelections(active.map((t: DocumentTypeItem) => ({ value: t.value, checked: false })))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '서류 유형 조회 실패')
    } finally {
      setLoadingTypes(false)
    }
  }

  // 모달이 열릴 때마다 (또는 대상 직원이 바뀔 때마다) state 완전 초기화.
  // useState 초기값은 첫 렌더에만 적용되므로 명시적 리셋 필수 —
  // 그렇지 않으면 A 직원 모달을 열었다 닫고 B 직원 모달을 열 때 A 의 전화번호/선택이 남아있음.
  useEffect(() => {
    if (open) {
      fetchTypes()
      setOtpPhone(defaultOtpPhone)
      setMessageBody(DEFAULT_SMS_TEMPLATE)
      setEditMode(false)
      // selections 은 fetchTypes 성공 시 새로 세팅되므로 여기서 별도 처리 불필요
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workerId, defaultOtpPhone])

  const typeMap = useMemo(() => {
    const m = new Map<string, DocumentTypeItem>()
    docTypes.forEach(t => m.set(t.value, t))
    return m
  }, [docTypes])

  const checkedItems = useMemo(() => selections.filter(s => s.checked), [selections])

  const toggleType = (value: string, checked: boolean) => {
    setSelections(prev => prev.map(s => (s.value === value ? { ...s, checked } : s)))
  }
  const setCustomLabel = (value: string, label: string) => {
    setSelections(prev => prev.map(s => (s.value === value ? { ...s, customLabel: label } : s)))
  }

  const documentListPreview = useMemo(() => {
    return checkedItems
      .map((s, i) => {
        const def = typeMap.get(s.value)
        const label = def?.is_other
          ? (s.customLabel?.trim() || '(기타 라벨 입력 필요)')
          : (def?.label ?? s.value)
        return `${i + 1}. ${label}`
      })
      .join('\n')
  }, [checkedItems, typeMap])

  const smsPreview = useMemo(() => {
    return renderSmsBody(messageBody, {
      name: workerName || '직원',
      documentList: documentListPreview || '(서류 미선택)',
      url: `${APP_URL}/worker-documents/{token}`,
    })
  }, [messageBody, workerName, documentListPreview])

  const handleReset = () => {
    setSelections(docTypes.map(t => ({ value: t.value, checked: false })))
    setOtpPhone(defaultOtpPhone)
    setMessageBody(DEFAULT_SMS_TEMPLATE)
  }

  const handleSubmit = async () => {
    if (checkedItems.length === 0) {
      toast.error('최소 1개 이상의 서류를 선택해주세요.')
      return
    }
    for (const s of checkedItems) {
      const def = typeMap.get(s.value)
      if (def?.is_other && !s.customLabel?.trim()) {
        toast.error('"기타" 서류는 라벨을 직접 입력해야 합니다.')
        return
      }
    }
    if (!otpPhone.trim() || otpPhone.replace(/\D/g, '').length < 9) {
      toast.error('OTP 수신 전화번호가 유효하지 않습니다.')
      return
    }

    setIsSending(true)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: checkedItems.map(s => {
            const def = typeMap.get(s.value)
            return {
              document_type: s.value,
              document_label: def?.is_other ? s.customLabel?.trim() : undefined,
            }
          }),
          otp_phone: otpPhone.replace(/-/g, ''),
          message_body: messageBody,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('서류 요청 SMS가 발송되었습니다.')
        handleReset()
        onClose()
        onCreated?.()
      } else if (res.status === 207 && json.data?.url) {
        // partial success: 요청은 생성됐으나 SMS 실패 → 링크 복사 제공
        toast.error(json.error, { duration: 6000 })
        void navigator.clipboard.writeText(json.data.url)
        toast.success('링크가 클립보드에 복사되었습니다. 직접 전달하세요.', { duration: 6000 })
        handleReset()
        onClose()
        onCreated?.()
      } else {
        toast.error(json.error ?? '요청 생성에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`서류 요청 — ${workerName}`}>
      <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto">
        {editMode ? (
          <DocumentTypeEditor
            initialTypes={docTypes}
            onCancel={() => setEditMode(false)}
            onSave={(saved) => {
              const active = saved.filter(t => t.is_active !== false)
              setDocTypes(active)
              // 편집 후 선택 상태는 초기화 (라벨/순서가 바뀌었을 수 있음)
              setSelections(active.map(t => ({ value: t.value, checked: false })))
              setEditMode(false)
            }}
          />
        ) : (
          <>
            {/* 서류 체크박스 + 편집 버튼 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-text-primary">
                  요청할 서류 선택 <span className="text-state-danger">*</span>
                </p>
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1 text-[11px] text-brand-700 hover:text-brand-800 px-2 py-1 rounded-md border border-brand-200 hover:bg-brand-50 transition-colors"
                  title="서류 리스트 편집 (모든 직원 공통)"
                >
                  <Pencil size={12} /> 리스트 편집
                </button>
              </div>
              <div className="space-y-1.5 border border-border-subtle rounded-xl p-3 bg-surface-sunken">
                {loadingTypes ? (
                  <p className="text-xs text-text-tertiary text-center py-4">불러오는 중...</p>
                ) : docTypes.length === 0 ? (
                  <p className="text-xs text-text-tertiary text-center py-4">
                    등록된 서류 유형이 없습니다. 우측 상단 &quot;리스트 편집&quot;에서 추가하세요.
                  </p>
                ) : (
                  docTypes.map(def => {
                    const sel = selections.find(s => s.value === def.value)
                    if (!sel) return null
                    return (
                      <div key={def.value}>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sel.checked}
                            onChange={e => toggleType(def.value, e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary font-medium">{def.label}</p>
                            {def.hint && (
                              <p className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">{def.hint}</p>
                            )}
                          </div>
                        </label>
                        {sel.checked && def.is_other && (
                          <input
                            type="text"
                            value={sel.customLabel ?? ''}
                            onChange={e => setCustomLabel(def.value, e.target.value)}
                            placeholder="기타 서류 이름 (예: 이력서)"
                            className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] border border-border rounded-md px-2.5 py-1.5 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                          />
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* OTP 수신 번호 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                OTP 수신 전화번호 <span className="text-state-danger">*</span>
              </label>
              <input
                type="tel"
                value={otpPhone}
                onChange={e => setOtpPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                직원이 서류 업로드 페이지에서 본인 인증할 때 이 번호로 인증번호가 발송됩니다.
              </p>
            </div>

            {/* SMS 본문 편집 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">문자 내용 (편집 가능)</label>
              <textarea
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                rows={7}
                className="w-full border border-border rounded-md px-3 py-2 text-xs bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none font-mono leading-relaxed"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                사용 가능한 변수: <code>{'{name}'}</code>, <code>{'{document_list}'}</code>, <code>{'{url}'}</code>
              </p>
            </div>

            {/* 미리보기 */}
            <div>
              <p className="text-sm font-semibold text-text-primary mb-1.5">문자 미리보기</p>
              <div className="border border-border rounded-lg p-3 bg-surface-sunken">
                <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                  {smsPreview}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>

      {!editMode && (
        <div className="flex gap-3 pt-4 border-t border-border-subtle mt-4">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSending}>취소</Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            isLoading={isSending}
            disabled={checkedItems.length === 0}
          >
            SMS 발송 ({checkedItems.length}개 서류)
          </Button>
        </div>
      )}
    </Modal>
  )
}
