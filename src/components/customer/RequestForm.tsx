'use client'

import { useState } from 'react'
import { CustomerRequest } from '@/types/database'

interface Props {
  initialRequests: CustomerRequest[]
}

export function RequestForm({ initialRequests }: Props) {
  const [requests, setRequests] = useState<CustomerRequest[]>(initialRequests)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/customer/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '전송 실패')
      setRequests(prev => [data.request, ...prev])
      setContent('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      {/* 작성 폼 */}
      <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">요청사항 작성</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="궁금하신 점이나 요청사항을 자유롭게 적어주세요."
            rows={4}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-text-tertiary"
          />
          {error && <p className="text-xs text-state-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="self-end bg-brand-600 text-white text-sm font-medium px-5 py-2 rounded-xl disabled:opacity-40 transition-opacity"
          >
            {submitting ? '전송 중...' : '전송'}
          </button>
        </form>
      </div>

      {/* 이력 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-primary">요청 이력</h2>
        {requests.length === 0 ? (
          <div className="text-center py-10 text-text-tertiary text-sm">
            아직 작성된 요청사항이 없습니다.
          </div>
        ) : (
          requests.map(r => (
            <div key={r.id} className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-4">
              <p className="text-xs text-text-tertiary mb-2">{fmt(r.created_at)}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{r.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
