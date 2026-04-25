import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface UpsertResult {
  inserted: number
  skipped: number
  errors: string[]
  month: string
}

// ─── POST 핸들러 ─────────────────────────────────────────────
// Make 시나리오가 매월 마지막 날 호출 → 당월 1회성케어 신청서를 customers로 이관
export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 이관 대상 월 결정 (쿼리 파라미터로 ?month=2026-04 형식 지정 가능, 기본값: 당월)
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')

  const now = monthParam ? new Date(`${monthParam}-01`) : new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const supabase = createServiceClient()
  const result: UpsertResult = { inserted: 0, skipped: 0, errors: [], month: yearMonth }

  // 당월 1회성케어 신청서 전체 조회
  const { data: applications, error: fetchError } = await supabase
    .from('service_applications')
    .select(`
      business_name, owner_name, phone, email, business_number,
      address, care_scope, payment_method, elevator, building_access,
      access_method, parking, door_password, business_hours_start,
      business_hours_end, account_number, platform_nickname,
      deposit, supply_amount, drive_folder_url, request_notes,
      internal_memo, pre_meeting_done, meeting_time
    `)
    .eq('service_type', '1회성케어')
    .gte('created_at', monthStart)
    .lt('created_at', monthEnd)
    .is('deleted_at', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!applications || applications.length === 0) {
    return NextResponse.json({ ...result, message: '이관 대상 신청서 없음' })
  }

  for (const app of applications) {
    if (!app.business_name?.trim()) continue

    try {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('business_name', app.business_name)
        .is('deleted_at', null)
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      const { error } = await supabase
        .from('customers')
        .insert({
          business_name: app.business_name,
          contact_name: app.owner_name ?? null,
          contact_phone: app.phone ?? null,
          address: app.address ?? null,
          care_scope: app.care_scope ?? null,
          payment_method: app.payment_method ?? null,
          elevator: app.elevator ?? null,
          access_method: app.access_method ?? null,
          building_access: app.building_access ?? null,
          parking_info: app.parking ?? null,
          door_password: null,
          business_hours_start: app.business_hours_start ?? null,
          business_hours_end: app.business_hours_end ?? null,
          business_number: app.business_number ?? null,
          email: app.email ?? null,
          account_number: app.account_number ?? null,
          platform_nickname: app.platform_nickname ?? null,
          deposit: app.deposit ?? null,
          supply_amount: app.supply_amount ?? null,
          drive_folder_url: app.drive_folder_url ?? null,
          notes: app.request_notes ?? null,
          special_notes: app.internal_memo ?? null,
          pre_meeting_done: app.pre_meeting_done ?? false,
          meeting_time: app.meeting_time ?? null,
          customer_type: '1회성케어',
          status: 'active',
        })

      if (error) {
        result.errors.push(`[${app.business_name}] ${error.message}`)
      } else {
        result.inserted++
      }
    } catch (e) {
      result.errors.push(`[${app.business_name}] ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    }
  }

  return NextResponse.json(result)
}
