'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FranchiseHeaderProps {
  brandName: string
  logoUrl: string | null
  managerName: string
}

export function FranchiseHeader({ brandName, logoUrl, managerName }: FranchiseHeaderProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/session', { method: 'DELETE' })
      router.push('/login')
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="w-9 h-9 rounded-lg object-cover bg-surface-sunken border border-border-subtle"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-brand-600 text-white flex items-center justify-center font-black text-sm">
              {brandName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest leading-none">
              본사 포털
            </p>
            <p className="text-base font-bold text-text-primary leading-tight truncate mt-0.5">
              {brandName}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-sunken active:scale-[0.98] transition-all"
          >
            <span className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
              {managerName.slice(0, 1)}
            </span>
            <span className="text-sm font-semibold text-text-primary hidden sm:inline">
              {managerName}
            </span>
            <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-44 bg-surface border border-border-subtle rounded-xl shadow-pop overflow-hidden z-20">
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-surface-sunken disabled:opacity-50"
                >
                  {loggingOut ? '로그아웃 중...' : '로그아웃'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
