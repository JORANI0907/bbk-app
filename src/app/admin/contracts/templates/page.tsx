'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FileText, Copy } from 'lucide-react'
import { Button } from '@/components/ui'
import { SectionHeader } from '@/components/ui'
import { EmptyState } from '@/components/ui'

const DEFAULT_HTML_BODY = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Pretendard Variable', Pretendard, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 32px; font-size: 14px; line-height: 1.8; color: #1a1a1a; }
  h1 { text-align: center; font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  h2 { font-size: 16px; font-weight: 700; margin-top: 24px; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #555; margin-bottom: 32px; }
  table.info { width: 100%; border-collapse: collapse; margin: 16px 0; }
  table.info td { border: 1px solid #ddd; padding: 8px 12px; font-size: 13px; }
  table.info td:first-child { background: #f8f8f8; font-weight: 600; width: 35%; }
</style>
</head>
<body>
<h1>서비스 계약서</h1>
<p class="subtitle">작성일: {{CONTRACT_YEAR}}년 {{CONTRACT_MONTH}}월 {{CONTRACT_DAY}}일</p>

<table class="info">
  <tr><td>고객사명</td><td>{{CUSTOMER_BUSINESS_NAME}}</td></tr>
  <tr><td>사업자번호</td><td>{{CUSTOMER_BUSINESS_NUMBER}}</td></tr>
  <tr><td>담당자</td><td>{{CUSTOMER_OWNER_NAME}}</td></tr>
  <tr><td>연락처</td><td>{{CUSTOMER_PHONE}}</td></tr>
  <tr><td>주소</td><td>{{CUSTOMER_ADDRESS}}</td></tr>
</table>

<h2>서비스 내용</h2>
{{SELECTED_ITEMS_LIST}}

<h2>계약 조건</h2>
<table class="info">
  <tr><td>계약 기간</td><td>{{CONTRACT_START_DATE}} ~ {{CONTRACT_END_DATE}}</td></tr>
  <tr><td>월 요금</td><td>{{MONTHLY_PRICE}}원</td></tr>
  <tr><td>연간 요금</td><td>{{ANNUAL_PRICE}}원</td></tr>
</table>
</body>
</html>`

interface TemplateListItem {
  id: string
  name: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function ContractTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/contract-templates')
      const json = await res.json()
      if (json.success) {
        setTemplates(json.data ?? [])
      }
    } catch {
      toast.error('양식 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const handleCreateNew = async () => {
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/contract-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '새 계약서 양식',
          description: '',
          html_body: DEFAULT_HTML_BODY,
          is_active: true,
        }),
      })
      const json = await res.json()
      if (json.success) {
        router.push(`/admin/contracts/templates/${json.data.id}`)
      } else {
        toast.error(json.error ?? '양식 생성에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDuplicate = async (id: string, name: string) => {
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/admin/contract-templates/${id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success(`'${name}' 양식이 복제됐습니다.`)
        router.push(`/admin/contracts/templates/${json.data.id}`)
      } else {
        toast.error(json.error ?? '복제에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setDuplicatingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/admin/contracts')}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ← 계약서 목록
        </button>
      </div>

      <SectionHeader
        level="page"
        title="계약서 양식 관리"
        subtitle="DB에 저장된 HTML 템플릿으로 계약서를 자동 생성합니다."
        action={
          <Button onClick={handleCreateNew} isLoading={isCreating}>
            새 양식 만들기
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-soft p-6">
          <EmptyState
            icon={<FileText size={40} />}
            title="아직 양식이 없습니다"
            description="'새 양식 만들기' 버튼을 눌러 첫 계약서 양식을 생성하세요."
            action={
              <Button onClick={handleCreateNew} isLoading={isCreating}>
                새 양식 만들기
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold text-text-primary truncate">
                      {tmpl.name}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tmpl.is_active
                          ? 'bg-state-success-bg text-state-success'
                          : 'bg-surface-sunken text-text-tertiary'
                      }`}
                    >
                      {tmpl.is_active ? '활성' : '비활성'}
                    </span>
                  </div>
                  {tmpl.description && (
                    <p className="text-sm text-text-secondary mt-1 truncate">
                      {tmpl.description}
                    </p>
                  )}
                  <p className="text-xs text-text-tertiary mt-2">
                    수정일: {formatDate(tmpl.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={duplicatingId === tmpl.id}
                    onClick={() => handleDuplicate(tmpl.id, tmpl.name)}
                  >
                    <Copy size={13} className="mr-1" />
                    복제
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/admin/contracts/templates/${tmpl.id}`)}
                  >
                    편집
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
