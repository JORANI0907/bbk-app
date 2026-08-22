import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderContractForStorage, type ContractCustomerInfo } from '@/lib/contractTemplate'

/**
 * POST /api/admin/contracts/preview
 *
 * v2 payload:
 *   {
 *     template_id: string,       // 필수 (기본 양식 없음)
 *     customer_info: {
 *       business_name, contact_name, contact_phone, address,
 *       business_number, email,
 *       contract_start_date, contract_end_date, care_scope
 *     },
 *   }
 *
 * v1 하위 호환: customer_id 만 전달되면 customers 에서 기본값 채워 렌더.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const templateId = body.template_id as string | undefined
  const rawInfo = body.customer_info as Partial<ContractCustomerInfo> | undefined
  const customerId = body.customer_id as string | undefined

  if (!templateId) {
    return NextResponse.json({ success: false, error: '계약서 양식(template_id)이 필요합니다.' }, { status: 400 })
  }

  // customer_info 가 없거나 부분만 있으면 customer 에서 폴백 채움
  let customerInfo: ContractCustomerInfo = {
    business_name: '', contact_name: '', contact_phone: '', address: '',
    business_number: '', email: '',
    contract_start_date: '', contract_end_date: '', care_scope: '',
  }
  if (rawInfo) customerInfo = { ...customerInfo, ...rawInfo }

  if (customerId && (!rawInfo || Object.values(rawInfo).some(v => !v))) {
    const { data: c } = await supabase
      .from('customers')
      .select('business_name, contact_name, contact_phone, address, address_detail, business_number, email, contract_start_date, contract_end_date, care_scope')
      .eq('id', customerId)
      .single()
    if (c) {
      customerInfo = {
        business_name:       rawInfo?.business_name       ?? (c.business_name       as string ?? ''),
        contact_name:        rawInfo?.contact_name        ?? (c.contact_name        as string ?? ''),
        contact_phone:       rawInfo?.contact_phone       ?? (c.contact_phone       as string ?? ''),
        address:             rawInfo?.address             ?? [c.address, c.address_detail].filter(Boolean).join(' '),
        business_number:     rawInfo?.business_number     ?? (c.business_number     as string ?? ''),
        email:               rawInfo?.email               ?? (c.email               as string ?? ''),
        contract_start_date: rawInfo?.contract_start_date ?? (c.contract_start_date as string ?? ''),
        contract_end_date:   rawInfo?.contract_end_date   ?? (c.contract_end_date   as string ?? ''),
        care_scope:          rawInfo?.care_scope          ?? (c.care_scope          as string ?? ''),
      }
    }
  }

  const { data: tmpl } = await supabase
    .from('contract_templates')
    .select('html_body')
    .eq('id', templateId)
    .single()

  if (!tmpl) {
    return NextResponse.json({ success: false, error: '양식을 찾을 수 없습니다.' }, { status: 404 })
  }

  // ⚠️ renderContractPreview 대신 renderContractForStorage 사용.
  // preview 결과가 그대로 편집기 초기 콘텐츠 → 저장 페이로드로 흘러가므로,
  // 서명 변수({{공급사서명}} 등)를 dashed placeholder 로 치환하면 스냅샷에 박제되어 사라짐.
  // renderContractForStorage 는 인적사항표·오늘날짜만 채우고 서명 변수는 원본 유지.
  const html = renderContractForStorage(tmpl.html_body as string, customerInfo)
  return NextResponse.json({ success: true, data: { html } })
}
