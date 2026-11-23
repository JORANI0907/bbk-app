'use client'

import { useState } from 'react'
import { Button, Input, Modal, Select } from '@/components/ui'
import {
  CATEGORY_LABELS, STATUS_LABELS, VISIBILITY_LABELS,
  type RegulationCategory, type RegulationStatus, type RegulationVisibility,
} from '@/lib/regulations/articles'
import type { RegulationMeta } from './useRegulationDetail'

interface MetaModalProps {
  open: boolean
  onClose: () => void
  meta: RegulationMeta
  onSave: (patch: Partial<RegulationMeta>) => Promise<boolean>
}

/** 규정 기본 정보(규정명·분류·공개범위·요약·상태) 수정 */
export default function MetaModal({ open, onClose, meta, onSave }: MetaModalProps) {
  const [form, setForm] = useState({
    title: meta.title, category: meta.category, visibility: meta.visibility,
    summary: meta.summary ?? '', status: meta.status,
  })
  const [isBusy, setIsBusy] = useState(false)

  const submit = async () => {
    setIsBusy(true)
    const okResult = await onSave({ ...form, summary: form.summary || null })
    setIsBusy(false)
    if (okResult) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${meta.code} 기본 정보`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={submit} isLoading={isBusy}>저장</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="규정명" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
        <div className="grid grid-cols-2 gap-3">
          <Select label="분류" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as RegulationCategory })} fullWidth>
            {(Object.keys(CATEGORY_LABELS) as RegulationCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Select label="공개 범위" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as RegulationVisibility })} fullWidth>
            {(Object.keys(VISIBILITY_LABELS) as RegulationVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>)}
          </Select>
        </div>
        <Input label="한 줄 요약" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} fullWidth maxLength={200} />
        <Select label="상태" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RegulationStatus })} fullWidth hint="폐지로 바꾸면 포털에서 사라지고 이력만 남습니다.">
          {(Object.keys(STATUS_LABELS) as RegulationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </Select>
      </div>
    </Modal>
  )
}
