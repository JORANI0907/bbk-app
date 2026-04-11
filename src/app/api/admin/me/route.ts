import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { updateAuthUserPassword } from '@/lib/auth-helpers'

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: worker, error } = await supabase
    .from('workers')
    .select('id, name, email, phone, role, status, employment_type')
    .eq('id', session.userId)
    .single()

  if (error) {
    // workers 테이블에 없으면 세션 정보만 반환
    return NextResponse.json({
      id: session.userId,
      name: session.name,
      role: session.role,
      email: null,
      phone: null,
    })
  }

  return NextResponse.json({ ...worker, role: session.role })
}

