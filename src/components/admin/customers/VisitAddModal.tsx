'use client'

/**
 * 투입일정(회차) 수동 추가 모달 (2026-11-01)
 *
 * 정기 진행흐름의 월 섹션 [+ 일정 추가] 에서 열림.
 * 날짜·시공시간·담당자·작업자를 고르고 저장하면 POST /api/admin/customers/[id]/visits 호출.
 * 담당자/작업자를 비워 두면 서버가 고객의 기본 담당자·작업자(요일·일자별 매핑 포함)를 쓴다.
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal, Button, Input, Select } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  /** 'YYYY-MM' — 기본 날짜를 이 달 안에서 잡는다 */
  month: string | null
  availableAssignees: { id: string; name: string }[]
  availableWorkers: { id: string; name: string }[]
  onCreate: (payload: { date: string; time: string | null; assigned_to: string | null | undefined; worker_ids: string[] | undefined }) => Promise<void>
}

function defaultDateFor(month: string | null): string {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (!month) return today
  return today.startsWith(month) ? today : `${month}-01`
}

export function VisitAddModal({ open, onClose, month, availableAssignees, availableWorkers, onCreate }: Props) {
  const [date, setDate] = useState(defaultDateFor(month))
  const [time, setTime] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>('')     // '' = 고객 기본값
  const [useDefaultWorkers, setUseDefaultWorkers] = useState(true)
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(defaultDateFor(month))
    setTime('')
    setAssignedTo('')
    setUseDefaultWorkers(true)
    setWorkerIds([])
  }, [open, month])

  const toggleWorker = (id: string) =>
    setWorkerIds(prev => (prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]))

  const handleSave = async () => {
    if (!date) { toast.error('날짜를 선택하세요.'); return }
    setSaving(true)
    try {
      await onCreate({
        date,
        time: time || null,
        assigned_to: assignedTo === '' ? undefined : (assignedTo === '__none__' ? null : assignedTo),
        worker_ids: useDefaultWorkers ? undefined : workerIds,
      })
      toast.success('투입일정을 추가했습니다.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="투입일정 추가"
      description="이 고객의 회차 1건을 직접 추가합니다. 담당자·작업자를 비우면 고객 기본 설정을 따릅니다."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '추가 중...' : '추가'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="시공일자" type="date" value={date} onChange={e => setDate(e.target.value)} fullWidth />
        <Input label="시공시간 (선택)" type="time" value={time} onChange={e => setTime(e.target.value)} fullWidth hint="비우면 시간 미정으로 저장됩니다." />
        <Select label="담당자" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} fullWidth>
          <option value="">고객 기본 담당자</option>
          <option value="__none__">담당자 없음</option>
          {availableAssignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>

        <div className="space-y-2">
          <p className="text-sm font-medium text-text-primary">작업자</p>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={useDefaultWorkers} onChange={e => setUseDefaultWorkers(e.target.checked)} />
            고객 기본 작업자 사용
          </label>
          {!useDefaultWorkers && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {availableWorkers.length === 0 && <p className="text-xs text-text-tertiary">등록된 작업자가 없습니다.</p>}
              {availableWorkers.map(w => (
                <label key={w.id} className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={workerIds.includes(w.id)} onChange={() => toggleWorker(w.id)} />
                  {w.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
