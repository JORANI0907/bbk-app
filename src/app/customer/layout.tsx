import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { CustomerNav } from '@/components/customer/CustomerNav'

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-border-subtle safe-area-pt shadow-flat">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/customer" className="flex items-center gap-1.5">
            <span className="text-xl font-black text-brand-600 tracking-tight">BBK</span>
            <span className="text-[10px] text-text-tertiary font-semibold uppercase tracking-widest">Korea</span>
          </Link>

          <form
            action={async () => {
              'use server'
              const cookieStore = cookies()
              cookieStore.delete('bbk_session')
              cookieStore.delete('bbk_access_token')
              cookieStore.delete('bbk_refresh_token')
              redirect('/login')
            }}
          >
            <button
              type="submit"
              className="text-xs text-text-tertiary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-sunken font-medium"
            >
              로그아웃
            </button>
          </form>
        </div>

        <CustomerNav />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full">{children}</main>
    </div>
  )
}
