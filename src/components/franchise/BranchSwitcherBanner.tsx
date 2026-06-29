'use client'

interface Props {
  branchName: string
}

export function BranchSwitcherBanner({ branchName }: Props) {
  const handleReturn = async () => {
    await fetch('/api/auth/preview-exit', { method: 'DELETE' })
    window.location.href = '/franchise'
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-brand-600 text-white text-sm font-medium flex items-center justify-center gap-3 py-2 px-4 shadow-soft">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
      </svg>
      <span className="truncate">
        본사 모드 — <strong className="font-bold">{branchName}</strong> 지점 보는 중
      </span>
      <button
        onClick={handleReturn}
        className="underline hover:no-underline text-white font-semibold whitespace-nowrap"
      >
        본사로 돌아가기
      </button>
    </div>
  )
}
