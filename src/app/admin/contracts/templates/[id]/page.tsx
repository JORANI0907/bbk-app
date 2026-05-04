'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import {
  TEMPLATE_KNOWN_VARS,
  TEMPLATE_PREVIEW_VALUES,
  renderTemplateWithVars,
  extractTemplateVars,
} from '@/lib/contractTemplate'

interface TemplateData {
  id: string
  name: string
  description: string
  html_body: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type MobileTab = 'edit' | 'preview'

export default function ContractTemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')

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
  const handleHtmlChange = (value: string) => {
    setHtmlBody(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(renderTemplateWithVars(value, TEMPLATE_PREVIEW_VALUES))
    }, 400)
  }

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
        body: JSON.stringify({ name, description, html_body: htmlBody, is_active: isActive }),
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

  const detectedVars = extractTemplateVars(htmlBody)

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
          <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
            삭제
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={isSaving}>
            저장
          </Button>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
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

      {/* 모바일 탭 전환 */}
      <div className="flex gap-1 bg-surface-sunken rounded-xl p-1 w-fit lg:hidden">
        {(['edit', 'preview'] as MobileTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mobileTab === tab
                ? 'bg-surface shadow-soft text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'edit' ? '편집' : '미리보기'}
          </button>
        ))}
      </div>

      {/* 에디터 + 미리보기 2-pane */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* HTML 에디터 */}
        <div className={`bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-2 ${mobileTab === 'preview' ? 'hidden lg:block' : ''}`}>
          <p className="text-sm font-semibold text-text-primary">HTML 편집</p>
          <textarea
            value={htmlBody}
            onChange={(e) => handleHtmlChange(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full border border-border rounded-md px-3 py-2 text-xs font-mono bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-y leading-relaxed"
            placeholder="HTML 코드를 입력하세요. 변수는 {{VAR_NAME}} 형식으로 입력합니다."
          />
          <p className="text-xs text-text-tertiary">변수는 <code className="bg-surface-sunken px-1 rounded">{'{{VAR_NAME}}'}</code> 형식으로 입력하세요.</p>
        </div>

        {/* 미리보기 */}
        <div className={`bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-2 ${mobileTab === 'edit' ? 'hidden lg:block' : ''}`}>
          <p className="text-sm font-semibold text-text-primary">미리보기 (샘플 데이터 적용)</p>
          <iframe
            srcDoc={previewHtml}
            title="계약서 미리보기"
            style={{ height: '600px', width: '100%', border: 'none' }}
            className="rounded-md bg-white"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* 감지된 변수 패널 */}
      {detectedVars.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-3">
          <p className="text-sm font-semibold text-text-primary">감지된 변수</p>
          <div className="flex flex-wrap gap-2">
            {detectedVars.map((varName) => {
              const known = TEMPLATE_KNOWN_VARS[varName]
              if (!known) {
                return (
                  <span
                    key={varName}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-surface-sunken text-text-tertiary font-mono"
                  >
                    {'{{' + varName + '}}'}
                    <span className="text-text-tertiary text-[10px]">알 수 없음</span>
                  </span>
                )
              }
              return (
                <span
                  key={varName}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-mono ${
                    known.auto
                      ? 'bg-state-success-bg text-state-success'
                      : 'bg-state-warning-bg text-state-warning'
                  }`}
                >
                  {'{{' + varName + '}}'}
                  <span className="text-[10px] opacity-75">
                    {known.auto ? '자동' : '직접 입력'} · {known.label}
                  </span>
                </span>
              )
            })}
          </div>
          <p className="text-xs text-text-tertiary">
            <span className="inline-block w-3 h-3 rounded-full bg-state-success-bg border border-state-success mr-1" />
            초록: 고객/계약 정보에서 자동 입력
            <span className="inline-block w-3 h-3 rounded-full bg-state-warning-bg border border-state-warning mr-1 ml-3" />
            주황: 계약서 작성 시 직접 입력
          </p>
        </div>
      )}

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
