'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/session', { method: 'DELETE' })
    } catch {
      // 세션 삭제 실패해도 로그인 페이지로 이동
    }
    router.push('/login')
  }

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      isLoading={loading}
      className="w-full flex items-center justify-center gap-2 text-state-danger hover:bg-state-danger-bg border border-border-subtle"
    >
      <LogOut size={16} className="shrink-0" />
      {loading ? '로그아웃 중...' : '로그아웃'}
    </Button>
  )
}
