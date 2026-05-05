'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'

function PwInput({
  placeholder, value, onChange, show, onToggle, onKeyDown,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export function PasswordChangeForm() {
  const [open, setOpen] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setShowCurrent(false); setShowNew(false); setShowConfirm(false)
    setOpen(false)
  }

  const handleSubmit = async () => {
    if (!currentPw || !newPw || !confirmPw) { toast.error('모든 항목을 입력해주세요.'); return }
    if (newPw.length < 8) { toast.error('새 비밀번호는 8자 이상이어야 합니다.'); return }
    if (newPw !== confirmPw) { toast.error('새 비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/customer/mypage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '변경 실패')
      toast.success('비밀번호가 변경되었습니다.')
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <span className="text-xs text-text-tertiary w-20 shrink-0">비밀번호</span>
        <span className="text-sm text-text-primary font-medium flex-1 tracking-[0.2em] select-none">••••••••</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-text-tertiary hover:text-brand-600 transition-colors p-1 -mr-1"
          aria-label="비밀번호 변경"
        >
          <Eye size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">비밀번호 변경</span>
        <button type="button" onClick={reset} className="text-xs text-text-tertiary hover:text-text-secondary">
          취소
        </button>
      </div>
      <div className="flex flex-col gap-2 bg-surface-sunken rounded-xl p-3">
        <PwInput placeholder="현재 비밀번호" value={currentPw} onChange={setCurrentPw}
          show={showCurrent} onToggle={() => setShowCurrent(v => !v)} />
        <PwInput placeholder="새 비밀번호 (8자 이상)" value={newPw} onChange={setNewPw}
          show={showNew} onToggle={() => setShowNew(v => !v)} />
        <PwInput placeholder="새 비밀번호 확인" value={confirmPw} onChange={setConfirmPw}
          show={showConfirm} onToggle={() => setShowConfirm(v => !v)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={loading}
        isLoading={loading}
        variant="primary"
        className="py-2.5 text-sm font-semibold rounded-xl active:scale-[0.98]"
      >
        {loading ? '변경 중...' : '변경하기'}
      </Button>
    </div>
  )
}
