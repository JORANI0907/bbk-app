import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPayslipEmail, isValidRealEmail } from '@/lib/email'
import { sendPayslipSMS } from '@/lib/solapi'

/**
 * 이미 발행된 급여명세서를 재발송하는 API
 * POST /api/admin/payroll/payslips/send-existing
 *
 * 요청: { items: [{ payslipId }] }
 * 각 payslipId 에 대해:
 *  1) payroll_payslips 레코드 조회 (storage_path 필수)
 *  2) storage 에서 PDF 다운로드 → base64 로 변환
 *  3) 새 서명 URL 발급 (7일)
 *  4) 인원의 phone/email 조회
 *  5) 이메일(첨부) + SMS(다운로드 링크) 발송
 *  6) 이력 업데이트 (sent_at, file_url 갱신 등)
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7

type SendItem = { payslipId: string }
type SendResult = {
  payslipId: string
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
      return NextResponse.json({ error: '1회 최대 100건까지 재발송 가능합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const results: SendResult[] = []

    for (const item of items) {
      const r: SendResult = { payslipId: item.payslipId, personName: '-', smsSent: false, emailSent: false }
      try {
        // 1) 발행 이력 조회
        const { data: payslip, error: fetchErr } = await supabase
          .from('payroll_payslips')
          .select('id, year_month, person_type, person_id, person_name, storage_path, file_name, net_amount')
          .eq('id', item.payslipId)
          .single()
        if (fetchErr || !payslip) throw new Error('명세서를 찾을 수 없습니다')
        r.personName = payslip.person_name as string

        if (!payslip.storage_path) {
          r.skippedReason = 'PDF 원본 경로 없음 (이전 발행분은 재발송 불가 · 새로 발행 후 발송 필요)'
          results.push(r)
          continue
        }

        // 2) 새 서명 URL 발급
        const signedRes = await supabase.storage
          .from('payslips')
          .createSignedUrl(payslip.storage_path as string, SIGNED_URL_TTL_SECONDS)
        if (signedRes.error || !signedRes.data?.signedUrl) {
          throw new Error(`서명 URL 생성 실패: ${signedRes.error?.message ?? 'unknown'}`)
        }
        const signedUrl = signedRes.data.signedUrl

        // 3) 인원 phone/email 조회
        let phone: string | null = null
        let email: string | null = null
        if (payslip.person_type === 'worker') {
          const { data } = await supabase
            .from('workers')
            .select('phone, email')
            .eq('id', payslip.person_id as string)
            .single()
          phone = data?.phone ?? null
          email = data?.email ?? null
        } else {
          const { data } = await supabase
            .from('users')
            .select('phone, email')
            .eq('id', payslip.person_id as string)
            .single()
          phone = data?.phone ?? null
          email = data?.email ?? null
        }
        const hasPhone = !!phone && phone.replace(/\D/g, '').length >= 9
        const hasEmail = isValidRealEmail(email)
        if (!hasPhone && !hasEmail) {
          r.skippedReason = '연락처·이메일 모두 없음'
          results.push(r)
          continue
        }

        // 월 라벨
        const [y, m] = (payslip.year_month as string).split('-')
        const monthLabel = `${y}년 ${Number(m)}월`

        // 4) 이메일 발송 (PDF 첨부: storage에서 다운로드)
        let pdfBase64: string | null = null
        if (hasEmail && email) {
          try {
            const dl = await supabase.storage
              .from('payslips')
              .download(payslip.storage_path as string)
            if (dl.error || !dl.data) throw new Error(`PDF 다운로드 실패: ${dl.error?.message ?? 'unknown'}`)
            const buf = Buffer.from(await dl.data.arrayBuffer())
            pdfBase64 = buf.toString('base64')
            await sendPayslipEmail({
              toEmail: email,
              personName: payslip.person_name as string,
              monthLabel,
              fileName: (payslip.file_name as string) ?? `급여명세서_${payslip.person_name}_${payslip.year_month}.pdf`,
              pdfBase64,
              downloadUrl: signedUrl,
            })
            r.emailSent = true
          } catch (err) {
            console.error('[send-existing] 이메일 실패:', err)
            r.error = `이메일 실패: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        // 5) SMS 발송
        if (hasPhone && phone) {
          try {
            await sendPayslipSMS({
              toPhone: phone,
              personName: payslip.person_name as string,
              monthLabel,
              downloadUrl: signedUrl,
              netAmount: (payslip.net_amount as number | null) ?? null,
              emailSent: r.emailSent,
            })
            r.smsSent = true
          } catch (err) {
            console.error('[send-existing] SMS 실패:', err)
            r.error = (r.error ? r.error + ' · ' : '') + `SMS 실패: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        // 6) 이력 업데이트
        const nowIso = new Date().toISOString()
        const update: Record<string, unknown> = {
          is_sent: r.smsSent || r.emailSent,
          sent_at: nowIso,
          file_url: signedUrl,   // 새 서명 URL 로 갱신
        }
        if (r.smsSent) {
          update.sent_sms_at = nowIso
          update.sms_recipient = phone
        }
        if (r.emailSent) {
          update.sent_email_at = nowIso
          update.email_recipient = email
        }
        const channels: string[] = []
        if (r.smsSent) channels.push('sms')
        if (r.emailSent) channels.push('email')
        if (channels.length > 0) update.sent_channel = channels.join(',')
        if (r.error) update.send_error = r.error

        await supabase.from('payroll_payslips').update(update).eq('id', item.payslipId)
      } catch (err) {
        r.error = err instanceof Error ? err.message : String(err)
      }
      results.push(r)
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error('[send-existing] 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '재발송 실패' },
      { status: 500 },
    )
  }
}
