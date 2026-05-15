import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = createServiceClient()

  // users 테이블에서 기본 정보 조회 (session.userId = users.id)
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, email, phone, role, password_hint')
    .eq('id', session.userId)
    .single()

  if (userError || !user) {
    return NextResponse.json({
      id: session.userId,
      name: session.name,
      role: session.role,
      email: null,
      phone: null,
      password_hint: null,
    })
  }

  // workers 테이블에서 부가 정보(고용형태 등) 조회
  const { data: worker } = await supabase
    .from('workers')
    .select('employment_type, status')
    .eq('user_id', session.userId)
    .single()

  return NextResponse.json({
    ...user,
    employment_type: worker?.employment_type ?? null,
    status: worker?.status ?? null,
  })
}
