import { NextRequest, NextResponse } from 'next/server'
import { tmpdir } from 'os'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { notifySlack } from '@/lib/slack'
import { sendAlimtalk } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { renderQuotePdf, type QuotePdfData } from '@/lib/quotePdf'
import { Resend } from 'resend'
import { uploadQuoteToDrive } from '@/lib/driveUpload'

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
  // 계좌 (선택)
  bank_name?: string
  bank_account_number?: string
  bank_account_holder?: string
  // 고객
  owner_name: string
  business_name: string
  phone: string
  phone_2?: string | null      // 알림수신 추가번호
  phone_notify_1?: boolean     // 메인 연락처 발송 여부 (기본 true)
  phone_notify_2?: boolean     // 추가번호 발송 여부 (기본 true)
  email: string
  address: string
  construction_date: string
  // 항목 & 금액
  quote_items: QuoteItem[]
  supply_amount: number
  vat: number
  total_amount: number
  // 할인 (선택)
  discount_amount?: number       // 1차 할인 (%/금액)
  discount_rate?: number
  discount_base_label?: string      // '총액' | '공급가액'
  orig_supply_amount?: number
  orig_total_amount?: number
  // 할인2 (잔돈 라운딩) — PDF·이메일에서 별도 라인으로 표시
  discount2_amount?: number
  // 옵션
  valid_days?: number
  notes?: string
  hide_item_prices?: boolean
  seal_image_url?: string
  // saved_quotes 배열 특정 항목에 발송 결과 반영 (선택)
  saved_quote_id?: string
  // 견적서 이름 (사용자 지정) — 파일명에 포함
  quote_label?: string
}

// 파일명용 sanitize — 파일시스템 예약문자 제거 + 공백 정규화 + 길이 제한
function sanitizeForFilename(s: string | null | undefined, maxLen = 60): string {
  return (s ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

// 파일명 규칙: 업체명 + 견적서이름 + 견적서번호
function buildQuoteFileName(businessName: string | null | undefined, label: string | null | undefined, quoteNo: string): string {
  const parts = [
    sanitizeForFilename(businessName) || '고객',
    sanitizeForFilename(label) || '견적서',
    quoteNo,
  ]
  return parts.join('_') + '.pdf'
}

function generateQuoteNo(): string {
  // 분 단위(같은 분에 여러 발송 시 파일 덮어씀 문제) → 초 + 3자리 랜덤 suffix로 유니크 보장.
  // fileName = `${quoteNo}.pdf` 라서 quoteNo가 유니크해야 각 견적서 PDF가 각각 유지됨.
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `BBK-D-${d}-${suffix}`
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
    bank_name, bank_account_number, bank_account_holder,
    owner_name, business_name, phone, phone_2, phone_notify_1, phone_notify_2,
    email, address,
    construction_date, quote_items, supply_amount, vat, total_amount,
    discount_amount, discount_rate, discount_base_label,
    orig_supply_amount, orig_total_amount,
    discount2_amount,
    valid_days, notes, hide_item_prices, seal_image_url,
    saved_quote_id,
    quote_label,
  } = body

  const notify1 = phone_notify_1 !== false     // 기본 true
  const notify2 = phone_notify_2 !== false     // 기본 true
  const p2 = (typeof phone_2 === 'string' && phone_2.trim()) ? phone_2.trim() : null

  const todayStr      = new Date().toISOString().slice(0, 10)
  const validUntilStr = addDays(todayStr, valid_days ?? 5)
  const quoteNo      = generateQuoteNo()
  const fmtKr        = (n: number) => n.toLocaleString('ko-KR')
  const safeVat      = vat ?? 0

  let pdfUrl: string | undefined
  const errors: Record<string, string>     = {}  // critical: pdf/upload/db
  const softErrors: Record<string, string> = {}  // non-blocking: email/kakao

  // ── 0. 인감 이미지 → 임시 로컬 파일로 저장 ─────────────────
  // @react-pdf/renderer v4는 data URL의 MIME 파싱에 버그가 있어
  // 로컬 파일 경로(fs)로 전달해야 정상 동작한다
  let sealTmpPath: string | undefined
  if (seal_image_url) {
    try {
      const imgRes = await fetch(seal_image_url)
      if (!imgRes.ok) {
        const msg = `HTTP ${imgRes.status} ${imgRes.statusText}`
        console.error(`[send] 인감 다운로드 실패: ${msg} (${seal_image_url})`)
        softErrors.seal = `인감 이미지 다운로드 실패 (${msg})`
      } else {
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const sizeKB = Math.round(imgBuf.length / 1024)
        // 진단 로그만 남기고 사용자에게 경고 팝업은 띄우지 않음
        // 클라이언트에서 자동 축소 후 업로드하므로 크기 문제는 사전 차단됨
        console.log(`[send] 인감 다운로드 성공: ${sizeKB}KB`)
        sealTmpPath = join(tmpdir(), `bbk-seal-${Date.now()}.png`)
        await writeFile(sealTmpPath, imgBuf)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[send] 인감 처리 실패:`, msg)
      softErrors.seal = `인감 처리 실패 (${msg})`
    }
  }

  // ── 1. PDF 생성 ─────────────────────────────────────────────
  let pdfBuffer: Buffer | undefined
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
    // 계좌
    bankName:          bank_name           || undefined,
    bankAccountNumber: bank_account_number || undefined,
    bankAccountHolder: bank_account_holder || undefined,
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
    // 할인
    discountAmount:    discount_amount,
    discountRate:      discount_rate,
    discountBaseLabel: discount_base_label,
    origSupplyAmount:  orig_supply_amount,
    origTotalAmount:   orig_total_amount,
    discount2Amount:   discount2_amount,
    // 옵션
    notes:           notes            || undefined,
    hideItemPrices:  hide_item_prices ?? false,
    sealImageUrl:    sealTmpPath,
  }
  try {
    pdfBuffer = await renderQuotePdf(pdfData)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[send] PDF 렌더 실패 (seal=${sealTmpPath ? 'yes' : 'no'}):`, msg)
    errors.pdf = msg
    // 인감이 있는 상태에서 렌더 실패했다면 인감 없이 한번 더 시도 (인감이 원인일 가능성)
    if (sealTmpPath) {
      try {
        console.log('[send] 인감 없이 PDF 재시도')
        pdfBuffer = await renderQuotePdf({ ...pdfData, sealImageUrl: undefined })
        delete errors.pdf
        softErrors.seal = `인감으로 인해 PDF 생성 실패 — 인감 없이 발송됨 (원본 오류: ${msg})`
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2)
        console.error(`[send] 인감 없이도 PDF 실패:`, msg2)
        errors.pdf = `${msg} / 재시도: ${msg2}`
      }
    }
  } finally {
    if (sealTmpPath) unlink(sealTmpPath).catch(() => {})
  }

  // ── 2. Supabase Storage 업로드 ──────────────────────────────
  if (pdfBuffer) {
    try {
      const supabase = createServiceClient()
      const fileName = buildQuoteFileName(business_name, quote_label, quoteNo)

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

  // ── 2-b. Google Drive 업로드 (non-blocking) ─────────────────
  if (pdfBuffer) {
    try {
      const driveUrl = await uploadQuoteToDrive(
        pdfBuffer,
        buildQuoteFileName(business_name, quote_label, quoteNo),
      )
      if (driveUrl) console.log('[send] Drive 업로드 완료:', driveUrl)
    } catch (e) {
      console.error('[send] Drive 업로드 실패 (non-critical):', e)
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
    ${((discount_amount && discount_amount > 0) || (discount2_amount && discount2_amount > 0))
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">${discount_base_label === '총액' ? '합계 (할인 전)' : '공급가액 (할인 전)'}</td><td style="text-decoration:line-through;color:#888;">${fmtKr((discount_base_label === '총액' ? orig_total_amount : orig_supply_amount) ?? 0)}원</td></tr>`
      : ''}
    ${discount_amount && discount_amount > 0
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#d9534f;white-space:nowrap;">할인${discount_rate ? ` (${discount_rate}%)` : ''}</td><td style="color:#d9534f;">-${fmtKr(discount_amount)}원</td></tr>`
      : ''}
    ${discount2_amount && discount2_amount > 0
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#d9534f;white-space:nowrap;">할인2 (잔돈)</td><td style="color:#d9534f;">-${fmtKr(discount2_amount)}원</td></tr>`
      : ''}
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
  // 메인 연락처(phone) + 알림수신 추가번호(phone_2) 두 곳으로 조건부 발송.
  // PDF 문서 자체에는 메인 연락처만 표시(변경 없음). 알림 발송 대상만 확장.
  const targets: string[] = []
  if (notify1 && phone) targets.push(phone)
  if (notify2 && p2) targets.push(p2)

  const kakaoVars = {
    '고객명':     owner_name        || '',
    '업체명':     business_name     || '',
    '견적서번호': quoteNo,
    '시공일자':   construction_date || '',
    '총액':       `${fmtKr(total_amount || 0)}원`,
    '유효기간':   validUntilStr,
    '견적서링크': pdfUrl || '',
  }
  const fallbackText = `[BBK 공간케어] 견적서가 발송되었습니다. 견적서 번호: ${quoteNo}`

  for (const target of targets) {
    try {
      await sendAlimtalk(target, QUOTE_KAKAO_TEMPLATE_ID, kakaoVars, fallbackText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      softErrors.kakao = softErrors.kakao ? `${softErrors.kakao} / ${target}: ${msg}` : `${target}: ${msg}`
      console.error(`카카오 알림톡 발송 실패 (${target}, non-critical):`, msg)
    }
  }

  // ── 5. DB 저장 (quote_log 누적 + saved_quotes 반영) ─────────
  try {
    const supabase = createServiceClient()

    const { data: current } = await supabase
      .from('service_applications')
      .select('quote_log, saved_quotes')
      .eq('id', id)
      .single()

    const existingLog: QuoteLogEntry[] = Array.isArray(current?.quote_log) ? current.quote_log : []
    const sentAtIso = new Date().toISOString()
    const newEntry: QuoteLogEntry = {
      quote_no:     quoteNo,
      pdf_url:      pdfUrl || null,
      sent_at:      sentAtIso,
      total_amount: total_amount || 0,
    }

    // saved_quote_id 지정 시 해당 항목에 발송 결과 반영
    let updatedSavedQuotes: unknown[] | undefined
    if (saved_quote_id) {
      const existingSaved = Array.isArray(current?.saved_quotes) ? current.saved_quotes : []
      updatedSavedQuotes = existingSaved.map((q: Record<string, unknown>) =>
        q.id === saved_quote_id
          ? { ...q, quote_no: quoteNo, pdf_url: pdfUrl || null, sent_at: sentAtIso, updated_at: sentAtIso }
          : q
      )
    }

    const updatePatch: Record<string, unknown> = {
      last_quote_no:     quoteNo,
      last_quote_pdf_url: pdfUrl || null,
      quote_items,
      quote_log: [...existingLog, newEntry],
      // 관리자가 견적서 발송 화면에서 조작한 알림 설정을 함께 저장
      phone_2: p2,
      phone_notify_1: notify1,
      phone_notify_2: notify2,
    }
    if (updatedSavedQuotes !== undefined) updatePatch.saved_quotes = updatedSavedQuotes

    await supabase
      .from('service_applications')
      .update(updatePatch)
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
