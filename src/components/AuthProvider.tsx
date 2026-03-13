'use client'

import { useAuthInit } from '@/hooks/useAuth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuthInit()
  return <>{children}</>
}
