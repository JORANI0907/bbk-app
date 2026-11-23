'use client'

import { useState } from 'react'
import { Button, Input, Modal, Textarea } from '@/components/ui'

interface PublishModalProps {
  open: boolean
  onClose: () => void
  defaultDate: string
  defaultSummary: string
  versionNo: number
  onPublish: (effectiveDate: string, changeSummary: string, force: boolean) => Promise<boolean>
}

/** 발행 모달: 시행일·개정 사유 입력 → 발행. 조 번호 오류면 강행 여부를 묻는다. */
export default function PublishModal({ open, onClose, defaultDate, defaultSummary, versionNo, onPublish }: PublishModalProps) {
  const [date, setDate] = useState(defaultDate)
  const [summary, setSummary] = useState(defaultSummary)
  const [force, setForce] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const submit = async () => {
    setIsBusy(true)
    const okResult = await onPublish(date, summary, force)
    setIsBusy(false)
    if (okResult) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`제${versionNo}판 발행`}
      description="발행하면 이 편집본이 시행본이 되고 더 이상 수정할 수 없습니다. 이후 수정은 새 개정판으로 만듭니다."
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={submit} isLoading={isBusy}>발행</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="시행일" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth />
        <Textarea label="제정·개정 사유" value={summary} onChange={(e) => setSummary(e.target.value)} autosize showCount maxLength={500} fullWidth placeholder="예: 제정 / 프리랜서 보수 정산 주기 변경" />
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          조 번호가 빠지거나 중복돼도 발행 (검사 건너뛰기)
        </label>
      </div>
    </Modal>
  )
}
