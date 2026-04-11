import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 공급자 고정 정보
const SUPPLIER = {
  registration_number: '2987800455',
  company_name: '범빌드코리아',
  representative: '조동환',
  address: '경기도 성남시 중원구 둔촌대로268번길22, 201호',
  business_type: '사업시설 관리, 사업지원 및 임대 서비스업',
  business_item: '건축물 일반 청소업',
} as const

// 계산서 대상 결제수단 키워드
const INVOICE_KEYWORDS = ['현금(계산서 희망)', '계산서']

function getThisWeekSaturdayAndLastWeekSaturday(): { from: string; to: string } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 6=Sat
  const daysToThisSat = (6 - dayOfWeek + 7) % 7
  const thisSat = new Date(now)
  thisSat.setDate(now.getDate() + daysToThisSat)
  thisSat.setHours(23, 59, 59, 999)

  const lastSat = new Date(thisSat)
  lastSat.setDate(thisSat.getDate() - 7)
  lastSat.setHours(0, 0, 0, 0)

  return {
    from: lastSat.toISOString(),
    to: thisSat.toISOString(),
  }
}

function buildKeywordFilter(keywords: string[]): string {
  return keywords.map(k => `payment_method.ilike.%${k}%`).join(',')
}

export async function GET(_request: NextRequest) {
  const supabase = createServiceClient()
  const { from, to } = getThisWeekSaturdayAndLastWeekSaturday()

  const { data, error } = await supabase
    .from('service_applications')
    .select(`
      id,
      business_name,
      owner_name,
      business_number,
      payment_method,
      supply_amount,
      vat,
      construction_date,
      status
    `)
    .or(buildKeywordFilter(INVOICE_KEYWORDS))
    .gte('construction_date', from.slice(0, 10))
    .lte('construction_date', to.slice(0, 10))
    .order('construction_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    targets: data ?? [],
    period: { from: from.slice(0, 10), to: to.slice(0, 10) },
    count: (data ?? []).length,
  })
}

export async function POST(_request: NextRequest) {
  const supabase = createServiceClient()
  const { from, to } = getThisWeekSaturdayAndLastWeekSaturday()

  const { data, error } = await supabase
    .from('service_applications')
    .select(`
      id,
      business_name,
      owner_name,
      business_number,
      payment_method,
      supply_amount,
      vat,
      construction_date
    `)
    .or(buildKeywordFilter(INVOICE_KEYWORDS))
    .gte('construction_date', from.slice(0, 10))
    .lte('construction_date', to.slice(0, 10))
    .order('construction_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const targets = (data ?? []).map(row => {
    const supplyAmount = row.supply_amount ?? 0
    const vatAmount = row.vat ?? 0
    return {
      application_id: row.id,
      // 홈택스 탑재용 CSV 컬럼
      공급자등록번호: SUPPLIER.registration_number,
      공급자상호: SUPPLIER.company_name,
      공급자대표자: SUPPLIER.representative,
      공급자주소: SUPPLIER.address,
      공급자업태: SUPPLIER.business_type,
      공급자종목: SUPPLIER.business_item,
      공급받는자등록번호: row.business_number ?? '',
      공급받는자상호: row.business_name ?? '',
      공급받는자대표자: row.owner_name ?? '',
      작성일자: today,
      공급가액: supplyAmount,
      세액: vatAmount,
      품목: '공간케어 서비스',
      수량: 1,
      단가: supplyAmount,
    }
  })

  return NextResponse.json({
    targets,
    period: { from: from.slice(0, 10), to: to.slice(0, 10) },
    count: targets.length,
  })
}
