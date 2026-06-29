import { redirect } from 'next/navigation'
import { getFranchiseSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'
import { FranchiseHeader } from '@/components/franchise/FranchiseHeader'

export default async function FranchiseLayout({ children }: { children: React.ReactNode }) {
  const session = getFranchiseSession()
  if (!session) redirect('/login')

  const supabase = createServiceClient()
  const { data: hq } = await supabase
    .from('franchise_hq')
    .select('id, brand_name, logo_url')
    .eq('user_id', session.userId)
    .single()

  if (!hq) redirect('/login')

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <FranchiseHeader
        brandName={hq.brand_name}
        logoUrl={hq.logo_url}
        managerName={session.name}
      />
      <main className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
