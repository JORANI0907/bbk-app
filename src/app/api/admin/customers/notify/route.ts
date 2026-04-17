import { NextRequest, NextResponse } from 'next/server'
import { sendAlimtalk, sendSMS } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'

const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number | null) => n == null ? '0' : n.toLocaleString('ko-KR')

// ─── 알림 발송 후 업데이트할 pipeline_status ────────────────────
const NOTIFY_PIPELINE_STATUS: Record<string, string> = {
  '방문견적알림': 'quote_sent',
  '정기방문알림': 'service_scheduled',
  '작업완료알림': 'service_done',
  '정기결제알림': 'payment_done',
  '건당결제알림': 'payment_done',
  '계약갱신알림': 'renewal_pending',
  '계정안내알림': 'subscription_active',
}

// ─── 알림톡 템플릿 ID ─────────────────────────────────────────────
const ALIMTALK_TEMPLATES: Record<string, string> = {
  '정기결제알림': 'KA01TP260324125257636A2QdT1YNpL5',
  '정기방문알림': 'KA01TP260324125257699vIDeuYdkbc0',
  '계약갱신알림': 'KA01TP260324125257737g0vuFScqrCv',
  '건당결제알림': 'KA01TP260324125257773XLuybvXeleL', // PENDING → SMS fallback
  '방문견적알림': 'KA01TP260324125232920u1LmrtqCY0P',
  '작업완료알림': 'KA01TP260324125200271OOXEk0LPiAS',
  '계정안내알림': 'KA01TP260324125257807O2QPegF6wmS',
}

// ─── 변수 빌더 ────────────────────────────────────────────────────
function buildVariables(
  type: string,
  customer: Record<string, unknown>,
  extra: Record<string, string> = {},
): Record<string, string> {
  const name       = String(customer.contact_name ?? '')
  const bizName    = String(customer.business_name ?? '')
  const phone      = String(customer.contact_phone ?? '')
  const careType   = String(customer.customer_type ?? customer.billing_cycle ?? '-')
  const nextVisit  = fmtDate(customer.next_visit_date as string | null)
  const nextBill   = fmtDate(customer.billing_next_date as string | null)
  const contractEnd = fmtDate(customer.contract_end_date as string | null)
  const hoursStart = String(customer.business_hours_start ?? '-')
  const driveUrl   = extra.drive_url ?? String(customer.drive_folder_url ?? '-')
  const billingAmt = fmt(customer.billing_amount as number | null)
  const unitPrice  = fmt(customer.unit_price as number | null)

  switch (type) {
    case '정기결제알림':
      return { '#{고객명}': name, '#{청소비용}': billingAmt }

    case '건당결제알림':
      return { '#{고객명}': name, '#{청소비용}': unitPrice }

    case '정기방문알림':
      return { '#{고객명}': name, '#{상호명}': bizName, '#{방문예정일}': nextVisit }

    case '계약갱신알림':
      return { '#{고객명}': name, '#{상호명}': bizName, '#{만료일}': contractEnd }

    case '방문견적알림':
      return {
        '#{고객명}':   name,
        '#{성함}':     name,
        '#{연락처}':   phone,
        '#{케어유형}': careType,
        '#{시공일자}': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
        '#{방문시간}': extra.visit_time ?? hoursStart,
      }

    case '작업완료알림':
      return {
        '#{고객명}':       name,
        '#{구글URL}':      driveUrl,
        '#{청소비용}':     extra.amount ?? billingAmt,
        '#{입금자고객명}': name,
      }

    case '계정안내알림':
      return {
        '#{고객명}':  name,
        '#{아이디}':  extra.login_id ?? '-',
        '#{비밀번호}': extra.login_pw ?? '-',
      }

    default:
      return { '#{고객명}': name }
  }
}

// ─── SMS 폴백 텍스트 ─────────────────────────────────────────────
function buildFallback(type: string, customer: Record<string, unknown>): string {
  const name    = String(customer.contact_name ?? '')
  const bizName = String(customer.business_name ?? '')
  const map: Record<string, string> = {
    '정기결제알림': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 결제일이 다가왔습니다. 문의: 010-5434-4877`,
    '정기방문알림': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 방문 예정일이 다가왔습니다. 문의: 010-5434-4877`,
    '계약갱신알림': `[BBK 공간케어] ${name}님, ${bizName} 계약 만료가 다가왔습니다. 갱신 문의: 010-5434-4877`,
    '건당결제알림': `[BBK 공간케어] ${name}님, ${bizName} 건당 서비스 결제를 안내드립니다. 문의: 010-5434-4877`,
    '방문견적알림': `[BBK 공간케어] ${name}님, 방문 견적 일정을 안내드립니다. 문의: 010-5434-4877`,
    '작업완료알림': `[BBK 공간케어] ${name}님, ${bizName} 케어가 완료되었습니다. 감사합니다.`,
    '계정안내알림': `[BBK 공간케어] ${name}님, 고객 포털 계정 정보를 안내드립니다. 문의: 010-5434-4877`,
  }
  return map[type] ?? `[BBK 공간케어] ${name}님께 알림을 발송합니다.`
}

// ─── 핸들러 ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, type, ...extra } = body as {
      customer_id: string
      type: string
      drive_url?: string
      amount?: string
      visit_date?: string
      visit_time?: string
      login_id?: string
      login_pw?: string
    }

    if (!customer_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const templateId = ALIMTALK_TEMPLATES[type]
    if (!templateId) {
      return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .is('deleted_at', null)
      .single()

    if (!customer) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
    }

    const phone = (String(customer.contact_phone ?? '')).replace(/-/g, '')
    if (!phone) {
      return NextResponse.json({ error: '연락처가 없습니다.' }, { status: 400 })
    }

    const variables  = buildVariables(type, customer as Record<string, unknown>, extra as Record<string, string>)
    const fallback   = buildFallback(type, customer as Record<string, unknown>)

    // 건당결제알림은 PENDING이므로 실패 시 SMS로 자동 전환
    try {
      await sendAlimtalk(phone, templateId, variables, fallback)
    } catch (err) {
      if (type === '건당결제알림') {
        await sendSMS(phone, fallback)
      } else {
        throw err
      }
    }

    // 알림 발송 성공 후 pipeline_status 자동 업데이트
    const newStatus = NOTIFY_PIPELINE_STATUS[type]
    if (newStatus) {
      await supabase
        .from('customers')
        .update({ pipeline_status: newStatus })
        .eq('id', customer_id)
    }

    return NextResponse.json({ success: true, type, method: 'alimtalk', pipeline_status: newStatus ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
