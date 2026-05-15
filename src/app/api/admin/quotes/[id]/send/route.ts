import { NextRequest, NextResponse } from 'next/server'
import { notifySlack } from '@/lib/slack'
import { sendAlimtalk } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { renderQuotePdf, type QuotePdfData } from '@/lib/quotePdf'
import { Resend } from 'resend'

export const maxDuration = 60

const QUOTE_KAKAO_TEMPLATE_ID = 'KA01TP260219115331451o0aakYaJSp8'

interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  subtotal: number
}

interface QuoteLogEntry {
  quote_no: string
  pdf_url: string | null
  sent_at: string
  total_amount: number
}

interface QuoteSendBody {
  // 공급자
  company_name: string
  company_ceo: string
  company_biz_no: string
  company_phone: string
  company_address: string
  // 고객
  owner_name: string
  business_name: string
  phone: string
  email: string
  address: string
  construction_date: string
  // 항목 & 금액
  quote_items: QuoteItem[]
  supply_amount: number
  vat: number
  total_amount: number
  // 옵션
  valid_days?: number
  notes?: string
  hide_item_prices?: boolean
  seal_image_url?: string
}

function generateQuoteNo(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`
  return `BBK-D-${d}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: QuoteSendBody = await req.json()
  const {
    company_name, company_ceo, company_biz_no, company_phone, company_address,
    owner_name, business_name, phone, email, address,
    construction_date, quote_items, supply_amount, vat, total_amount,
    valid_days, notes, hide_item_prices, seal_image_url,
  } = body

  const todayStr      = new Date().toISOString().slice(0, 10)
  const validUntilStr = addDays(todayStr, valid_days ?? 5)
  const quoteNo      = generateQuoteNo()
  const fmtKr        = (n: number) => n.toLocaleString('ko-KR')
  const safeVat      = vat ?? 0

  let pdfUrl: string | undefined
  const errors: Record<string, string>     = {}  // critical: pdf/upload/db
  const softErrors: Record<string, string> = {}  // non-blocking: email/kakao

  // ── 0. 인감 이미지 → base64 data URL 변환 ───────────────────
  // @react-pdf/renderer v4는 원격 URL 직접 로드를 지원하지 않으므로
  // 서버에서 미리 fetch해서 data URL로 변환한다
  let sealDataUrl: string | undefined
  if (seal_image_url) {
    try {
      const imgRes = await fetch(seal_image_url)
      if (imgRes.ok) {
        const imgBuf     = Buffer.from(await imgRes.arrayBuffer())
        const imgMime    = imgRes.headers.get('content-type') || 'image/png'
        const cleanMime  = imgMime.split(';')[0].trim()
        sealDataUrl = `data:${cleanMime};base64,${imgBuf.toString('base64')}`
      }
    } catch {
      // 인감 이미지 로드 실패 시 인감 없이 PDF 생성 계속
    }
  }

  // ── 1. PDF 생성 ─────────────────────────────────────────────
  let pdfBuffer: Buffer | undefined
  try {
    const pdfData: QuotePdfData = {
      quoteNo,
      createdAt:        todayStr,
      validUntil:       validUntilStr,
      // 공급자
      companyName:    company_name    || 'BBK 공간케어',
      companyCeo:     company_ceo     || '박범건',
      companyBizNo:   company_biz_no  || '298-78-00455',
      companyPhone:   company_phone   || '031-759-4877',
      companyAddress: company_address || '경기도 성남시',
      // 고객
      ownerName:        owner_name        || '',
      businessName:     business_name     || '',
      phone:            phone             || '',
      email:            email             || '',
      address:          address           || '',
      constructionDate: construction_date || '',
      // 항목 & 금액
      quoteItems:   quote_items,
      supplyAmount: supply_amount || 0,
      vat:          safeVat,
      totalAmount:  total_amount  || 0,
      // 옵션
      notes:           notes            || undefined,
      hideItemPrices:  hide_item_prices ?? false,
      sealImageUrl:    sealDataUrl,
    }
    pdfBuffer = await renderQuotePdf(pdfData)
  } catch (e) {
    errors.pdf = e instanceof Error ? e.message : String(e)
  }

  // ── 2. Supabase Storage 업로드 ──────────────────────────────
  if (pdfBuffer) {
    try {
      const supabase = createServiceClient()
      const fileName = `${quoteNo}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('quote-pdfs')
        .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = supabase.storage
        .from('quote-pdfs')
        .getPublicUrl(fileName)
      pdfUrl = urlData.publicUrl
    } catch (e) {
      errors.upload = e instanceof Error ? e.message : String(e)
    }
  }

  // ── 3. 이메일 발송 (Resend) ─────────────────────────────────
  if (email && process.env.RESEND_API_KEY) {
    try {
      const resend  = new Resend(process.env.RESEND_API_KEY)
      const subject = `[BBK 공간케어] 견적서 안내 (${quoteNo})`
      const html    = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#333;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>안녕하세요, <strong>${owner_name}</strong>님.</p>
  <p>BBK 공간케어 견적서를 보내드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0;width:100%;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">견적서 번호</td><td>${quoteNo}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">업체명</td><td>${business_name || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">시공일자</td><td>${construction_date || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">공급가액</td><td>${fmtKr(supply_amount || 0)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">부가세</td><td>${fmtKr(safeVat)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">합계</td><td><strong>${fmtKr(total_amount || 0)}원</strong></td></tr>
    <tr><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">유효기간</td><td>${validUntilStr}까지</td></tr>
  </table>
  ${pdfUrl ? `<p><a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">견적서 바로보기</a></p>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="margin:0;">감사합니다.<br><strong>BBK 공간케어</strong></p>
</body>
</html>`

      await resend.emails.send({
        from: 'BBK 공간케어 <noreply@bbkorea.co.kr>',
        to: email,
        subject,
        html,
      })
    } catch (e) {
      softErrors.email = e instanceof Error ? e.message : String(e)
      console.error('이메일 발송 실패 (non-critical):', softErrors.email)
    }
  }

  // ── 4. 카카오 알림톡 ────────────────────────────────────────
  try {
    await sendAlimtalk(
      phone,
      QUOTE_KAKAO_TEMPLATE_ID,
      {
        '고객명':     owner_name        || '',
        '업체명':     business_name     || '',
        '견적서번호': quoteNo,
        '시공일자':   construction_date || '',
        '총액':       `${fmtKr(total_amount || 0)}원`,
        '유효기간':   validUntilStr,
        '견적서링크': pdfUrl || '',
      },
      `[BBK 공간케어] 견적서가 발송되었습니다. 견적서 번호: ${quoteNo}`,
    )
  } catch (e) {
    softErrors.kakao = e instanceof Error ? e.message : String(e)
    console.error('카카오 알림톡 발송 실패 (non-critical):', softErrors.kakao)
  }

  // ── 5. DB 저장 (quote_log 누적) ──────────────────────────────
  try {
    const supabase = createServiceClient()

    const { data: current } = await supabase
      .from('service_applications')
      .select('quote_log')
      .eq('id', id)
      .single()

    const existingLog: QuoteLogEntry[] = Array.isArray(current?.quote_log) ? current.quote_log : []
    const newEntry: QuoteLogEntry = {
      quote_no:     quoteNo,
      pdf_url:      pdfUrl || null,
      sent_at:      new Date().toISOString(),
      total_amount: total_amount || 0,
    }

    await supabase
      .from('service_applications')
      .update({
        last_quote_no:     quoteNo,
        last_quote_pdf_url: pdfUrl || null,
        quote_items,
        quote_log: [...existingLog, newEntry],
      })
      .eq('id', id)
  } catch (e) {
    errors.db = e instanceof Error ? e.message : String(e)
  }

  // ── 6. Slack ─────────────────────────────────────────────────
  await notifySlack({
    notifyType:       '견적서발송',
    customerName:     owner_name,
    phone,
    businessName:     business_name,
    constructionDate: construction_date || null,
    method:           'manual',
  }).catch(() => {})

  return NextResponse.json({
    success:  Object.keys(errors).length === 0,
    quote_no: quoteNo,
    pdf_url:  pdfUrl,
    ...(Object.keys(errors).length     > 0 && { errors }),
    ...(Object.keys(softErrors).length > 0 && { warnings: softErrors }),
  })
}
