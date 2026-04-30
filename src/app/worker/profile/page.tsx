'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default function WorkerProfilePage() {
  const { profile, signOut } = useAuth()

  if (!profile) return null

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-4">내 정보</h1>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600">
            {profile.name[0]}
          </div>
          <div>
            <p className="text-lg font-semibold text-text-primary">{profile.name}</p>
            <p className="text-sm text-text-secondary">{profile.phone}</p>
            <Badge variant="info" className="mt-1">직원</Badge>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          {profile.email && (
            <div className="flex justify-between">
              <span className="text-text-secondary">이메일</span>
              <span className="text-text-primary">{profile.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-secondary">가입일</span>
            <span className="text-text-primary">
              {new Date(profile.created_at).toLocaleDateString('ko-KR')}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="font-semibold text-text-primary mb-3">앱 정보</h2>
        <div className="space-y-2 text-sm text-text-secondary">
          <div className="flex justify-between">
            <span>버전</span>
            <span>1.0.0</span>
          </div>
        </div>
      </Card>

      <Button
        variant="danger"
        size="lg"
        className="w-full"
        onClick={signOut}
      >
        로그아웃
      </Button>
    </div>
  )
}
