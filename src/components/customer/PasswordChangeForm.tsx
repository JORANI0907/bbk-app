'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'

export function PasswordChangeForm() {
  const [open, setOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setOpen(false)
  }

  const handleSubmit = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error('모든 항목을 입력해주세요.')
      return
    }
    if (newPw.length < 8) {
      toast.error('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPw !== confirmPw) {
      toast.error('새 비밀번호가 일치하지 않습니다.')
      return
    }
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
      <Button
        onClick={() => setOpen(true)}
        variant="ghost"
        size="sm"
        className="text-sm text-brand-600 font-medium hover:underline"
      >
        비밀번호 변경
      </Button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3 bg-surface-sunken rounded-xl p-4">
      <input
        type="password"
        placeholder="현재 비밀번호"
        value={currentPw}
        onChange={e => setCurrentPw(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <input
        type="password"
        placeholder="새 비밀번호 (8자 이상)"
        value={newPw}
        onChange={e => setNewPw(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <input
        type="password"
        placeholder="새 비밀번호 확인"
        value={confirmPw}
        onChange={e => setConfirmPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={loading}
          isLoading={loading}
          variant="primary"
          className="flex-1 py-2.5 text-sm font-semibold rounded-xl active:scale-[0.98]"
        >
          {loading ? '변경 중...' : '변경하기'}
        </Button>
        <Button
          onClick={reset}
          variant="secondary"
          className="px-4 py-2.5 text-sm font-medium rounded-xl active:scale-[0.98]"
        >
          취소
        </Button>
      </div>
    </div>
  )
}
