import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

// ── 공급자 고정 정보 ─────────────────────────────────────────────
const SUPPLIER = {
  registration_number: '2987800455',
  company_name: '범빌드코리아',
  representative: '조동환',
  address: '경기도 성남시 중원구 둔촌대로268번길22, 201호',
  business_type: '사업시설 관리, 사업지원 및 임대 서비스업',
  business_item: '건축물 일반 청소업',
  email: 'sunrise@bbkorea.co.kr',
} as const

// 대상 상태 / 결제방법
const TARGET_STATUSES = ['결제완료', '결제완료(잔금)']
const TARGET_PAYMENT_METHODS = ['현금(계산서 희망)', '현금(계산서)']

const CRON_SECRET = process.env.CRON_SECRET

// ── 작성일자 계산 (기본: KST 오늘, override 가능: ?today=YYYY-MM-DD) ─
function getTargetDate(overrideYmd: string | null): { yyyymmdd: string; ddQuoted: string } {
  let y: number, m: number, d: number
  if (overrideYmd && /^\d{4}-\d{2}-\d{2}$/.test(overrideYmd)) {
    const parts = overrideYmd.split('-').map(Number)
    y = parts[0]; m = parts[1]; d = parts[2]
  } else {
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    y = nowKST.getUTCFullYear()
    m = nowKST.getUTCMonth() + 1
    d = nowKST.getUTCDate()
  }
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return {
    yyyymmdd: `${y}${mm}${dd}`,
    ddQuoted: `'${dd}`, // 선행 '  → 구글시트에서 "01" 이 "1"로 변환되는 것 방지
  }
}

// ── 핸들러 (Make 시나리오 또는 관리자 UI에서 호출) ──────────────────
async function handler(request: NextRequest) {
  // 1) Make/외부 호출: Bearer CRON_SECRET  2) 관리자 UI: 세션쿠키(admin)
  const auth = request.headers.get('authorization')
  const bearerOk = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  const session = getServerSession()
  const sessionOk = session?.role === 'admin'

  if (!bearerOk && !sessionOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // ids=<uuid,uuid,...>  수동 발행용 — 지정 항목만 조회 (상태/결제방법/0원 필터 건너뜀)
  const idsParam = new URL(request.url).searchParams.get('ids')
  const idsOverride = idsParam
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : null

  let query = supabase
    .from('service_applications')
    .select(`
      id,
      business_name,
      owner_name,
      business_number,
      address,
      email,
      payment_method,
      supply_amount,
      vat,
      construction_date,
      status
    `)

  if (idsOverride && idsOverride.length > 0) {
    query = query.in('id', idsOverride)
  } else {
    query = query
      .in('status', TARGET_STATUSES)
      .in('payment_method', TARGET_PAYMENT_METHODS)
      .gt('supply_amount', 0) // 공급가액 0원 제외 (의미없는 발행 방지)
  }

  const { data, error } = await query.order('construction_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const todayOverride = new URL(request.url).searchParams.get('today')
  const { yyyymmdd, ddQuoted } = getTargetDate(todayOverride)

  const targets = (data ?? []).map(row => {
    const supply = row.supply_amount ?? 0
    const vatAmt = row.vat ?? 0
    return {
      application_id: row.id,
      // 공급자 (고정)
      공급자등록번호: SUPPLIER.registration_number,
      공급자상호: SUPPLIER.company_name,
      공급자대표자: SUPPLIER.representative,
      공급자주소: SUPPLIER.address,
      공급자업태: SUPPLIER.business_type,
      공급자종목: SUPPLIER.business_item,
      공급자이메일: SUPPLIER.email,
      // 공급받는자 (DB 매핑)
      공급받는자등록번호: row.business_number ?? '',
      공급받는자상호: row.business_name ?? '',
      공급받는자대표자: row.owner_name ?? '',
      공급받는자주소: row.address ?? '',
      공급받는자이메일: row.email ?? '',
      // 금액
      공급가액: supply,
      세액: vatAmt,
      공급가액1: supply,
      세액1: vatAmt,
      // 날짜/구분 (선행 ' 처리)
      계산서종류: "'01",
      작성일자: yyyymmdd,
      일자1: ddQuoted,
      영수청구구분: "'01",
    }
  })

  return NextResponse.json({
    targets,
    count: targets.length,
    today: yyyymmdd,
  })
}

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}
