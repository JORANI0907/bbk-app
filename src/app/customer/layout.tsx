import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 safe-area-pt">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/customer" className="flex items-center gap-1">
            <span className="text-xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-xs text-gray-400 font-medium">Korea</span>
          </Link>

          <form
            action={async () => {
              'use server'
              const serverClient = createClient()
              await serverClient.auth.signOut()
              redirect('/login')
            }}
          >
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              로그아웃
            </button>
          </form>
        </div>

        <nav className="flex border-t border-gray-50">
          <Link
            href="/customer"
            className="flex-1 text-center py-2.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            홈
          </Link>
          <Link
            href="/customer/schedule"
            className="flex-1 text-center py-2.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            서비스 일정
          </Link>
          <Link
            href="/customer/reports"
            className="flex-1 text-center py-2.5 text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            서비스 리포트
          </Link>
        </nav>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full">{children}</main>
    </div>
  )
}
