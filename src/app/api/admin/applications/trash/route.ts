import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 접근 가능합니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('service_applications')
    .select('id, business_name, owner_name, phone, service_type, status, deleted_at, created_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ applications: data ?? [] })
}
