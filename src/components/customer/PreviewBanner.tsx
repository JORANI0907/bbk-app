'use client'

interface Props {
  userName: string
}

export function PreviewBanner({ userName }: Props) {
  const handleExit = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    window.location.href = '/admin/members'
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white text-sm font-medium flex items-center justify-center gap-3 py-2 px-4">
      <span>⚠️ 관리자 미리보기 모드 — {userName} 고객 계정</span>
      <button
        onClick={handleExit}
        className="underline hover:no-underline text-white font-semibold"
      >
        종료
      </button>
    </div>
  )
}
