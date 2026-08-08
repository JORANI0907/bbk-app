import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPayslipEmail, isValidRealEmail } from '@/lib/email'
import { sendPayslipSMS } from '@/lib/solapi'

/**
 * 급여명세서 일괄 발송 API
 * POST /api/admin/payroll/payslips/send
 *
 * 요청:
 * {
 *   items: [{
 *     personType: "user" | "worker",
 *     personId: string,
 *     personName: string,
 *     phone: string | null,
 *     email: string | null,
 *     month: string,           // "2026-07"
 *     fileName: string,        // "급여명세서_이우진_2026-07.pdf"
 *     pdfBase64: string,
 *   }]
 * }
 *
 * 응답:
 * {
 *   results: [{
 *     personName, smsSent, emailSent, skippedReason?, error?
 *   }]
 * }
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7  // 7일

type SendItem = {
  personType: 'user' | 'worker'
  personId: string
  personName: string
  phone: string | null
  email: string | null
  month: string
  fileName: string
  pdfBase64: string
  netAmount?: number | null
}

type SendResult = {
  personName: string
  smsSent: boolean
  emailSent: boolean
  skippedReason?: string
  error?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const items = body?.items as SendItem[] | undefined

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items 배열이 필요합니다.' }, { status: 400 })
    }
    if (items.length > 100) {
      return NextResponse.json({ error: '1회 최대 100명까지 발송 가능합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const results: SendResult[] = []

    for (const item of items) {
      const r: SendResult = { personName: item.personName, smsSent: false, emailSent: false }
      try {
        // 1) 유효성 검증
        const hasPhone = typeof item.phone === 'string' && item.phone.replace(/\D/g, '').length >= 9
        const hasEmail = isValidRealEmail(item.email)
        if (!hasPhone && !hasEmail) {
          r.skippedReason = '연락처·이메일 모두 없음'
          results.push(r)
          continue
        }

        // 2) PDF를 Storage에 업로드 (private) + 서명 URL 생성
        const objectPath = `${item.month}/${item.personType}_${item.personId}_${Date.now()}.pdf`
        const pdfBuffer = Buffer.from(item.pdfBase64, 'base64')

        const uploadRes = await supabase.storage
          .from('payslips')
          .upload(objectPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
        if (uploadRes.error) throw new Error(`Storage 업로드 실패: ${uploadRes.error.message}`)

        const signedRes = await supabase.storage
          .from('payslips')
          .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS)
        if (signedRes.error || !signedRes.data?.signedUrl) {
          throw new Error(`서명 URL 생성 실패: ${signedRes.error?.message ?? 'unknown'}`)
        }
        const signedUrl = signedRes.data.signedUrl

        // 3) 월 라벨
        const [y, m] = item.month.split('-')
        const monthLabel = `${y}년 ${Number(m)}월`

        // 4) 이메일 발송 (있으면)
        if (hasEmail && item.email) {
          try {
            await sendPayslipEmail({
              toEmail: item.email,
              personName: item.personName,
              monthLabel,
              fileName: item.fileName,
              pdfBase64: item.pdfBase64,
              downloadUrl: signedUrl,
            })
            r.emailSent = true
          } catch (err) {
            console.error('[payslip-send] 이메일 실패:', err)
            r.error = `이메일 실패: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        // 5) SMS 발송 (있으면)
        if (hasPhone && item.phone) {
          try {
            await sendPayslipSMS({
              toPhone: item.phone,
              personName: item.personName,
              monthLabel,
              downloadUrl: signedUrl,
              netAmount: item.netAmount ?? null,
              emailSent: r.emailSent,
            })
            r.smsSent = true
          } catch (err) {
            console.error('[payslip-send] SMS 실패:', err)
            r.error = (r.error ? r.error + ' · ' : '') + `SMS 실패: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        // 6) payroll_payslips 최신 레코드 갱신 (당월·인원 매칭)
        const nowIso = new Date().toISOString()
        const update: Record<string, unknown> = {
          is_sent: r.smsSent || r.emailSent,
          sent_at: nowIso,
          file_url: signedUrl,
          file_name: item.fileName,
          storage_path: objectPath,   // 재발송용
        }
        if (r.smsSent) {
          update.sent_sms_at = nowIso
          update.sms_recipient = item.phone
        }
        if (r.emailSent) {
          update.sent_email_at = nowIso
          update.email_recipient = item.email
        }
        const channels: string[] = []
        if (r.smsSent) channels.push('sms')
        if (r.emailSent) channels.push('email')
        if (channels.length > 0) update.sent_channel = channels.join(',')
        if (r.error) update.send_error = r.error

        // 당월 최신 발행 이력에 upsert (없으면 INSERT)
        const { data: existing } = await supabase
          .from('payroll_payslips')
          .select('id')
          .eq('year_month', item.month)
          .eq('person_type', item.personType)
          .eq('person_id', item.personId)
          .order('issued_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (existing?.id) {
          await supabase.from('payroll_payslips').update(update).eq('id', existing.id)
        } else {
          // 발행 이력이 없는 경우 (급여관리 화면에서 저장만 하고 명세서 발행은 안 한 상태) — 기본 INSERT
          await supabase.from('payroll_payslips').insert({
            year_month: item.month,
            person_type: item.personType,
            person_id: item.personId,
            person_name: item.personName,
            pay_date: null,
            gross_amount: 0,
            deduction_amount: 0,
            net_amount: 0,
            status: 'CONFIRMED',
            issued_at: nowIso,
            ...update,
          })
        }
      } catch (err) {
        r.error = err instanceof Error ? err.message : String(err)
      }
      results.push(r)
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error('[payslip-send] 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '발송 실패' },
      { status: 500 },
    )
  }
}
