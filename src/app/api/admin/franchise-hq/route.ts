import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, franchiseEmail } from '@/lib/auth-helpers'
import { getServerSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { brandName, logoUrl, managerName, phone, password } = body as {
      brandName: string
      logoUrl?: string | null
      managerName: string
      phone: string
      password: string
    }

    if (!brandName?.trim() || !managerName?.trim() || !phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '브랜드명·담당자명·연락처·비밀번호는 필수입니다.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')
    const supabase = createServiceClient()

    // 동일 전화번호 중복 체크
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: '이미 등록된 연락처입니다.' }, { status: 409 })
    }

    // 1. Supabase Auth 사용자 생성
    const email = franchiseEmail(normalizedPhone)
    const authUser = await createAuthUser(email, password, { role: 'franchise_hq' })

    // 2. BBK users 행 생성
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        role: 'franchise_hq',
        name: managerName.trim(),
        phone: normalizedPhone,
        is_active: true,
      })
      .select('id')
      .single()
    if (userError || !newUser) {
      return NextResponse.json({ error: userError?.message ?? '사용자 등록 실패' }, { status: 500 })
    }

    // 3. franchise_hq 행 생성
    const { data: newHq, error: hqError } = await supabase
      .from('franchise_hq')
      .insert({
        user_id: newUser.id,
        brand_name: brandName.trim(),
        logo_url: logoUrl?.trim() || null,
      })
      .select('id, brand_name, logo_url')
      .single()
    if (hqError || !newHq) {
      return NextResponse.json({ error: hqError?.message ?? '본사 등록 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true, hq: newHq, userId: newUser.id })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
