'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import ContractEditor from '@/components/contracts/ContractEditor'
import {
  TEMPLATE_PREVIEW_VALUES,
  TEMPLATE_KNOWN_VARS,
  renderTemplateWithVars,
  extractTemplateVars,
} from '@/lib/contractTemplate'

interface TemplateData {
  id: string
  name: string
  description: string
  html_body: string
  is_active: boolean
  custom_vars: Record<string, string>
  created_at: string
  updated_at: string
}

export default function ContractTemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')
  const [customVarLabels, setCustomVarLabels] = useState<Record<string, string>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchTemplate = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/contract-templates/${id}`)
      const json = await res.json()
      if (json.success) {
        const tmpl: TemplateData = json.data
        setName(tmpl.name)
        setDescription(tmpl.description ?? '')
        setHtmlBody(tmpl.html_body)
        setIsActive(tmpl.is_active)
        setCustomVarLabels(tmpl.custom_vars ?? {})
        setPreviewHtml(renderTemplateWithVars(tmpl.html_body, TEMPLATE_PREVIEW_VALUES))
      } else {
        toast.error('양식을 불러오지 못했습니다.')
        router.push('/admin/contracts/templates')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
      router.push('/admin/contracts/templates')
    } finally {
      setIsLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    void fetchTemplate()
  }, [fetchTemplate])

  // HTML 변경 시 400ms 디바운스로 미리보기 업데이트
  const handleHtmlChange = useCallback((html: string) => {
    setHtmlBody(html)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(renderTemplateWithVars(html, TEMPLATE_PREVIEW_VALUES))
    }, 400)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('양식 이름을 입력해주세요.')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/contract-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, html_body: htmlBody, is_active: isActive, custom_vars: customVarLabels }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('저장되었습니다.')
      } else {
        toast.error(json.error ?? '저장에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/contract-templates/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast.success('양식이 삭제되었습니다.')
        router.push('/admin/contracts/templates')
      } else {
        toast.error(json.error ?? '삭제에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 상단 네비 + 액션 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => router.push('/admin/contracts/templates')}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ← 양식 목록
        </button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPreview(true)}
          >
            미리보기
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
            삭제
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={isSaving}>
            저장
          </Button>
        </div>
      </div>

      {/* 기본 정보 카드 */}
      <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              양식 이름 <span className="text-state-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 정기딥케어 표준 계약서"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="양식에 대한 간단한 설명"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-brand-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
          <span className="text-sm text-text-primary">
            {isActive ? '활성 — 계약서 생성 시 선택 가능' : '비활성 — 새 계약서에 표시 안 됨'}
          </span>
        </div>
      </div>

      {/* 계약서 에디터 */}
      <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5">
        <p className="text-sm font-semibold text-text-primary mb-4">계약서 내용 편집</p>
        <ContractEditor value={htmlBody} onChange={handleHtmlChange} />
      </div>

      {/* 변수 목록 패널 */}
      {(() => {
        const allVars = extractTemplateVars(htmlBody)
        if (allVars.length === 0) return null
        const customVars = allVars.filter(v => !(v in TEMPLATE_KNOWN_VARS))
        return (
          <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">변수 목록</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                계약서 HTML에서 감지된 변수입니다. <code className="bg-surface-sunken px-1 rounded">{'{{변수명}}'}</code> 형식으로 사용합니다.
              </p>
            </div>
            <div className="space-y-2">
              {allVars.map(v => {
                const known = TEMPLATE_KNOWN_VARS[v]
                return (
                  <div key={v} className="flex items-center gap-3 text-sm">
                    <code className="bg-surface-sunken px-2 py-0.5 rounded text-xs font-mono text-brand-600 whitespace-nowrap flex-shrink-0">
                      {`{{${v}}}`}
                    </code>
                    {known ? (
                      <span className="text-text-secondary flex items-center gap-1.5">
                        {known.label}
                        {known.auto
                          ? <span className="text-xs bg-state-success-bg text-state-success px-1.5 py-0.5 rounded-full">자동입력</span>
                          : <span className="text-xs bg-state-warning-bg text-state-warning px-1.5 py-0.5 rounded-full">계약서 작성 시 입력</span>
                        }
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={customVarLabels[v] ?? ''}
                        onChange={(e) => setCustomVarLabels(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder="변수 설명 입력 (예: 특이사항, 예약금)"
                        className="flex-1 border border-border rounded-md px-2 py-1 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {customVars.length > 0 && (
              <p className="text-xs text-text-tertiary border-t border-border-subtle pt-3">
                커스텀 변수는 계약서 작성 시 직접 값을 입력합니다. 설명을 입력하면 작성 화면에 표시됩니다.
              </p>
            )}
          </div>
        )
      })()}

      {/* 미리보기 모달 */}
      <Modal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="미리보기 (샘플 데이터 적용)"
      >
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">
            실제 고객 데이터 대신 샘플값으로 변수가 채워집니다.
          </p>
          <iframe
            srcDoc={previewHtml}
            title="계약서 미리보기"
            className="w-full rounded-lg bg-white border border-border"
            style={{ height: '70vh', border: 'none' }}
            sandbox="allow-same-origin"
          />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowPreview(false)}>
              닫기
            </Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="양식 삭제"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">{name}</strong> 양식을 삭제합니다.
            이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowDeleteModal(false)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              삭제
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
