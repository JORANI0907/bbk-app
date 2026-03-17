import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_APPLICATIONS_DB_ID = process.env.NOTION_APPLICATIONS_DB_ID
const MAKE_WEBHOOK_URL = process.env.MAKE_APPLICATION_WEBHOOK_URL

async function syncToNotion(application: Record<string, string>) {
  if (!NOTION_TOKEN || !NOTION_APPLICATIONS_DB_ID) return null

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_APPLICATIONS_DB_ID },
        properties: {
          '업체명': { title: [{ text: { content: application.businessName ?? '' } }] },
          '대표자명': { rich_text: [{ text: { content: application.ownerName ?? '' } }] },
          '플랫폼닉네임': { rich_text: [{ text: { content: application.platformNickname ?? '' } }] },
          '연락처': { phone_number: application.phone ?? '' },
          '이메일': { email: application.email ?? '' },
          '주소': { rich_text: [{ text: { content: application.address ?? '' } }] },
          '사업자번호': { rich_text: [{ text: { content: application.businessNumber ?? '' } }] },
          '영업시간': { rich_text: [{ text: { content: `${application.businessHoursStart ?? ''} ~ ${application.businessHoursEnd ?? ''}` } }] },
          '엘리베이터': { select: { name: application.elevator ?? '해당없음' } },
          '건물출입': { select: { name: application.buildingAccess ?? '신청불필요' } },
          '출입방법': { rich_text: [{ text: { content: application.accessMethod ?? '' } }] },
          '주차': { select: { name: application.parking ?? '주차없음' } },
          '결제방법': { select: { name: application.paymentMethod ?? '현금' } },
          '계좌번호': { rich_text: [{ text: { content: application.accountNumber ?? '' } }] },
          '요청사항': { rich_text: [{ text: { content: application.requestNotes ?? '' } }] },
          '상태': { select: { name: '신규' } },
          '신청일시': { rich_text: [{ text: { content: application.timestamp ?? '' } }] },
        },
      }),
    })
    const data = await res.json()
    return res.ok ? data.id : null
  } catch (e) {
    console.error('Notion sync error:', e)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Make.com 웹훅 시크릿 검증 (선택)
    const body = await request.json()

    const {
      timestamp, ownerName, platformNickname, phone, address,
      businessName, businessNumber, email,
      businessHoursStart, businessHoursEnd,
      elevator, buildingAccess, accessMethod, parking,
      paymentMethod, accountNumber,
      privacyConsent, serviceConsent, requestNotes,
    } = body

    if (!ownerName || !phone || !businessName || !address) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createServiceClient()

    // Supabase 저장
    const { data: inserted, error } = await supabase
      .from('service_applications')
      .insert({
        submitted_at: timestamp,
        owner_name: ownerName,
        platform_nickname: platformNickname,
        phone,
        email,
        business_name: businessName,
        business_number: businessNumber,
        address,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        elevator,
        building_access: buildingAccess,
        access_method: accessMethod,
        parking,
        payment_method: paymentMethod,
        account_number: accountNumber,
        privacy_consent: privacyConsent,
        service_consent: serviceConsent,
        request_notes: requestNotes,
        status: '신규',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Notion 미러링 (비동기, 실패해도 OK)
    const notionPageId = await syncToNotion(body)
    if (notionPageId && inserted) {
      await supabase
        .from('service_applications')
        .update({ notion_page_id: notionPageId })
        .eq('id', inserted.id)
    }

    // Make 웹훅 (카카오 알림 + Gmail)
    if (MAKE_WEBHOOK_URL) {
      fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          ownerName,
          phone,
          email,
          emailId: email ? email.split('@')[0] : '',
          address,
          businessNumber,
          businessHoursStart,
          businessHoursEnd,
          elevator,
          buildingAccess,
          accessMethod,
          parking,
          paymentMethod,
          accountNumber,
          platformNickname,
          requestNotes,
        }),
      }).catch(err => console.error('Make webhook error:', err))
    }

    return NextResponse.json({ success: true, id: inserted?.id }, { headers: CORS_HEADERS })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Webhook error:', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS })
  }
}
