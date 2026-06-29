'use client'

import { useState } from 'react'

interface Props {
  branchName: string
}

export function BranchSwitcherFAB({ branchName }: Props) {
  const [busy, setBusy] = useState(false)

  const handleReturn = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/auth/preview-exit', { method: 'DELETE' })
      window.location.href = '/franchise'
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col items-start gap-2 max-w-[calc(100vw-2rem)]">
      {/* 현재 보는 지점 라벨 */}
      <div className="bg-gray-950 text-white rounded-xl px-3 py-2 shadow-2xl border border-gray-700 max-w-full">
        <p className="text-[10px] font-bold text-sky-300 uppercase tracking-widest leading-none whitespace-nowrap">
          본사 모드
        </p>
        <p className="text-xs font-semibold text-white/90 leading-tight mt-1 truncate max-w-[180px]">
          {branchName} 지점
        </p>
      </div>

      {/* 관리자 홈 버튼 */}
      <button
        onClick={handleReturn}
        disabled={busy}
        className="bg-sky-500 text-white border border-sky-400 text-sm font-bold px-4 py-2.5 rounded-xl shadow-2xl hover:bg-sky-600 active:scale-[0.97] transition-all select-none disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span>{busy ? '이동 중...' : '관리자 홈'}</span>
      </button>
    </div>
  )
}
