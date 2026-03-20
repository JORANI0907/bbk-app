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
const MAKE_WEBHOOK_URL =
  process.env.MAKE_APPLICATION_WEBHOOK_URL ??
  'https://hook.eu2.make.com/hkbb3jhkz2cefv1kcn8awrpm472jho2x'

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
    const body = await request.json()

    const {
      timestamp, ownerName, platformNickname, phone, address,
      businessName, businessNumber, email, emailId, emailDomain,
      businessHoursStart, businessHoursEnd,
      elevator, buildingAccess, accessMethod, parking,
      paymentMethod, accountNumber,
      privacyConsent, serviceConsent, requestNotes,
    } = body

    if (!ownerName || !phone || !businessName || !address) {
      return NextResponse.json(
        { error: '필수 항목이 누락되었습니다.' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    const supabase = createServiceClient()

    const makePayload = {
      businessName,
      ownerName,
      phone,
      email,
      emailId: emailId ?? (email ? email.split('@')[0] : ''),
      emailDomain: emailDomain ?? (email ? email.split('@')[1] : ''),
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
      timestamp,
    }

    // Supabase 저장과 Make 웹훅을 병렬 실행 — 하나가 실패해도 나머지는 동작
    const [supabaseResult, makeResult] = await Promise.allSettled([
      supabase
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
        .single(),
      fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayload),
      }),
    ])

    if (makeResult.status === 'rejected') {
      console.error('Make webhook error:', makeResult.reason)
    } else {
      console.log('Make webhook status:', makeResult.value.status)
    }

    // Supabase 결과 처리
    let insertedId: string | null = null
    if (supabaseResult.status === 'fulfilled') {
      const { data: inserted, error } = supabaseResult.value
      if (error) {
        console.error('Supabase insert error:', error)
      } else {
        insertedId = inserted?.id ?? null
      }
    } else {
      console.error('Supabase error:', supabaseResult.reason)
    }

    // Notion 미러링 (Supabase 성공 시에만, 실패해도 OK)
    if (insertedId) {
      try {
        const notionPageId = await syncToNotion(body)
        if (notionPageId) {
          await supabase
            .from('service_applications')
            .update({ notion_page_id: notionPageId })
            .eq('id', insertedId)
        }
      } catch (e) {
        console.error('Notion error:', e)
      }
    }

    return NextResponse.json(
      { success: true, id: insertedId },
      { headers: CORS_HEADERS },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Webhook handler error:', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS })
  }
}
