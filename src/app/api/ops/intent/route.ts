/**
 * 대표 의도 조회 — admin + worker 모두 접근 가능한 lightweight endpoint.
 * /admin/page.tsx (홈) 상단 IntentBanner 렌더링에 사용.
 * 기존 /api/admin/ops/dashboard 는 admin 전용이라 worker 가 홈에서 사용 불가 → 별도 신설.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  }
  if (session.role !== 'admin' && session.role !== 'worker') {
    return NextResponse.json({ ok: false, error: '접근 권한 없음' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('company_intent')
    .select('purpose, intent_1, intent_2, intent_3, year')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    intent: row ?? {
      purpose: '',
      intent_1: '',
      intent_2: '',
      intent_3: '',
      year: new Date().getFullYear(),
    },
  })
}
