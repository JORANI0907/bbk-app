import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { updateAuthUserPassword } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { password } = body

  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
  }

  // workers 테이블에서 auth_id 조회
  const supabase = createServiceClient()
  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('auth_id')
    .eq('id', session.userId)
    .single()

  if (workerError || !worker?.auth_id) {
    // auth_id가 없으면 users 테이블에서 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('auth_id')
      .eq('id', session.userId)
      .single()

    if (userError || !user?.auth_id) {
      return NextResponse.json({ error: '사용자 인증 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    try {
      await updateAuthUserPassword(user.auth_id, password)
      return NextResponse.json({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 변경 실패'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    await updateAuthUserPassword(worker.auth_id, password)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '비밀번호 변경 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
