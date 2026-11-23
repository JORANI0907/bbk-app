'use client'

/**
 * 회사 규정 목록 (관리자). 분류 탭 → 규정 행 → 상세(편집·미리보기·개정이력).
 * 2026-11-23 1차: 관리자 전용. 직원·고객 포털 연결은 2차.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { BookOpen } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Modal, ScrollToTopButton, SectionHeader, Select, Spinner } from '@/components/ui'
import {
  CATEGORY_LABELS, STATUS_LABELS, VISIBILITY_LABELS,
  type RegulationCategory, type RegulationStatus, type RegulationVisibility,
} from '@/lib/regulations/articles'

interface RegulationListItem {
  id: string
  code: string
  title: string
  category: RegulationCategory
  visibility: RegulationVisibility
  summary: string | null
  status: RegulationStatus
  current: { version_no: number; effective_date: string | null; published_at: string | null } | null
  draft_updated_at: string | null
}

const CATEGORY_ORDER: RegulationCategory[] = ['legal_hr', 'sop', 'customer_policy']
const STATUS_VARIANT: Record<RegulationStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning', active: 'success', retired: 'default',
}

const EMPTY_FORM = { code: '', title: '', category: 'legal_hr' as RegulationCategory, visibility: 'worker' as RegulationVisibility, summary: '' }

export default function RegulationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<RegulationListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<RegulationCategory | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isCreating, setIsCreating] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/regulations')
      const json = await res.json()
      if (json.success) setItems(json.data)
      else toast.error(json.error ?? '목록을 불러오지 못했습니다.')
    } catch {
      toast.error('목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/regulations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) { toast.error(json.error ?? '생성에 실패했습니다.'); return }
      toast.success('규정이 생성되었습니다. 본문을 작성하세요.')
      setShowCreate(false)
      setForm(EMPTY_FORM)
      router.push(`/admin/regulations/${json.data.id}`)
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsCreating(false)
    }
  }

  const visible = items.filter((r) => tab === 'all' || r.category === tab)
  const grouped = CATEGORY_ORDER.map((c) => ({ category: c, rows: visible.filter((r) => r.category === c) })).filter((g) => g.rows.length)

  return (
    <div className="space-y-6">
      <SectionHeader
        level="page"
        title="회사 규정"
        subtitle="전자법령 방식으로 규정을 제정·개정하고 직원·고객에게 안내합니다. 발행 전 편집본은 관리자만 봅니다."
        action={<Button onClick={() => setShowCreate(true)}>새 규정</Button>}
      />

      <div className="inline-flex gap-1 bg-surface-sunken rounded-xl p-1 flex-wrap">
        {(['all', ...CATEGORY_ORDER] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t === 'all' ? '전체' : CATEGORY_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <EmptyState icon={<BookOpen size={40} />} title="등록된 규정이 없습니다" description="새 규정을 만들거나 시드 스크립트로 원고를 불러오세요." />
      ) : (
        grouped.map((g) => (
          <section key={g.category} className="space-y-2">
            <SectionHeader level="section" title={CATEGORY_LABELS[g.category]} subtitle={`${g.rows.length}건`} />
            <div className="bg-surface border border-border-subtle rounded-2xl divide-y divide-border-subtle">
              {g.rows.map((r) => <RegulationRow key={r.id} item={r} onOpen={() => router.push(`/admin/regulations/${r.id}`)} />)}
            </div>
          </section>
        ))
      )}

      <ScrollToTopButton />

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="새 규정"
        description="코드는 분류별 접두(HR·OP·CP)와 번호로 정합니다. 본문은 생성 후 편집기에서 작성합니다."
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>취소</Button>
            <Button onClick={handleCreate} isLoading={isCreating}>생성</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="규정 코드" placeholder="HR-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} fullWidth />
            <Select label="분류" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as RegulationCategory })} fullWidth>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </Select>
          </div>
          <Input label="규정명" placeholder="프리랜서(위탁) 운영 기준" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
          <Select label="공개 범위" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as RegulationVisibility })} fullWidth hint="1차에서는 어느 범위를 골라도 관리자만 봅니다. 포털 연결은 2차.">
            {(Object.keys(VISIBILITY_LABELS) as RegulationVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>)}
          </Select>
          <Input label="한 줄 요약" placeholder="목록에 표시되는 설명" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} fullWidth maxLength={200} />
        </div>
      </Modal>
    </div>
  )
}

function RegulationRow({ item, onOpen }: { item: RegulationListItem; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full text-left px-4 py-3 md:px-6 flex flex-col md:flex-row md:items-center gap-2 hover:bg-surface-sunken transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-text-tertiary">{item.code}</span>
          <span className="text-sm font-semibold text-text-primary break-keep">{item.title}</span>
          <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
          {item.draft_updated_at && item.status === 'active' && <Badge variant="info">편집 중</Badge>}
        </div>
        {item.summary && <p className="text-xs text-text-secondary mt-0.5 break-keep">{item.summary}</p>}
      </div>
      <div className="text-xs text-text-tertiary md:text-right shrink-0">
        <p>{VISIBILITY_LABELS[item.visibility]}</p>
        <p>{item.current ? `제${item.current.version_no}판 · 시행 ${item.current.effective_date ?? '-'}` : '미발행'}</p>
      </div>
    </button>
  )
}
