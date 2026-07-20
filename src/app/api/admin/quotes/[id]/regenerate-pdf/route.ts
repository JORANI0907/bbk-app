import { NextRequest, NextResponse } from 'next/server'
import { tmpdir } from 'os'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { createServiceClient } from '@/lib/supabase/server'
import { renderQuotePdf, type QuotePdfData, type QuoteItem } from '@/lib/quotePdf'
import { uploadQuoteToDrive } from '@/lib/driveUpload'

export const maxDuration = 60

interface SavedQuote {
  id: string
  label: string
  quote_items: QuoteItem[]
  pricing_mode: 'itemized' | 'total' | 'supply'
  direct_amount: number
  discount_mode: 'none' | 'rate' | 'amount'
  discount_rate: number
  discount_input: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  valid_days: number
  notes: string
  quote_no: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// 견적서 발송과 동일한 유니크 quote_no 생성 규칙 (초 + 3자리 랜덤 suffix)
function generateQuoteNo(): string {
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

function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim()
}

/**
 * POST /api/admin/quotes/[id]/regenerate-pdf
 * Body: { saved_quote_id: string }
 *
 * 알림·이메일 발송 없이 PDF만 재생성:
 * - saved_quotes 배열의 해당 항목을 조회
 * - 새 quote_no 발급 (유니크 보장)
 * - PDF 렌더 → Supabase Storage 업로드 → Google Drive 백업
 * - saved_quotes 해당 항목의 quote_no·pdf_url·updated_at 갱신
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json() as { saved_quote_id?: string }
  const { saved_quote_id } = body

  if (!saved_quote_id) {
    return NextResponse.json({ error: 'saved_quote_id 필수' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 신청서 + saved_quotes 조회
  const { data: app } = await supabase
    .from('service_applications')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!app) {
    return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
  }

  const savedQuotes: SavedQuote[] = Array.isArray(app.saved_quotes) ? app.saved_quotes : []
  const target = savedQuotes.find(q => q.id === saved_quote_id)

  if (!target) {
    return NextResponse.json({ error: '해당 견적서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 공급자 정보
  const { data: settings } = await supabase
    .from('quote_settings')
    .select('*')
    .limit(1)
    .single()

  const quoteNo = generateQuoteNo()
  const todayStr = new Date().toISOString().slice(0, 10)
  const validUntilStr = addDays(todayStr, target.valid_days ?? 10)

  // 인감 이미지 처리 (data URL MIME 파싱 버그 회피)
  let sealTmpPath: string | undefined
  const sealUrl = settings?.seal_image_url
  if (sealUrl) {
    try {
      const imgRes = await fetch(sealUrl)
      if (imgRes.ok) {
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        sealTmpPath = join(tmpdir(), `bbk-seal-${Date.now()}.png`)
        await writeFile(sealTmpPath, imgBuf)
      }
    } catch {
      // 인감 없이 계속
    }
  }

  // 원본 saved_quote 데이터로 할인 계산 재현
  const { origSupply, origTotal } = (() => {
    if (target.pricing_mode === 'itemized') {
      const s = target.quote_items.reduce((sum, i) => sum + i.subtotal, 0)
      return { origSupply: s, origTotal: s + Math.round(s * 0.1) }
    }
    if (target.pricing_mode === 'total') {
      const s = Math.round(target.direct_amount / 1.1)
      return { origSupply: s, origTotal: target.direct_amount }
    }
    return { origSupply: target.direct_amount, origTotal: target.direct_amount + Math.round(target.direct_amount * 0.1) }
  })()
  const discountBase = target.pricing_mode === 'total' ? origTotal : origSupply
  const discountAmount = (() => {
    if (target.discount_mode === 'rate') {
      const rate = Math.max(0, Math.min(100, target.discount_rate))
      return Math.min(Math.round((rate / 100) * discountBase), discountBase)
    }
    if (target.discount_mode === 'amount') {
      return Math.min(Math.max(0, Math.floor(target.discount_input)), discountBase)
    }
    return 0
  })()
  const effectiveRate = discountBase > 0
    ? Math.round((discountAmount / discountBase) * 1000) / 10
    : 0

  const pdfData: QuotePdfData = {
    quoteNo,
    createdAt:  todayStr,
    validUntil: validUntilStr,
    // 고객
    ownerName:        app.owner_name ?? '',
    businessName:     app.business_name ?? '',
    phone:            app.phone ?? '',
    email:            app.email ?? '',
    address:          app.address ?? '',
    constructionDate: app.construction_date ?? '',
    // 공급자
    companyName:    settings?.company_name    ?? 'BBK 공간케어',
    companyCeo:     settings?.company_ceo     ?? '박범건',
    companyBizNo:   settings?.company_biz_no  ?? '298-78-00455',
    companyPhone:   settings?.company_phone   ?? '031-759-4877',
    companyAddress: settings?.company_address ?? '경기도 성남시',
    bankName:          settings?.bank_name           ?? undefined,
    bankAccountNumber: settings?.bank_account_number ?? undefined,
    bankAccountHolder: settings?.bank_account_holder ?? undefined,
    // 항목·금액
    quoteItems:   target.quote_items ?? [],
    supplyAmount: target.supply_amount ?? 0,
    vat:          target.vat_amount ?? 0,
    totalAmount:  target.total_amount ?? 0,
    // 할인
    discountAmount:    discountAmount > 0 ? discountAmount : undefined,
    discountRate:      discountAmount > 0 ? effectiveRate : undefined,
    discountBaseLabel: target.pricing_mode === 'total' ? '총액' : '공급가액',
    origSupplyAmount:  origSupply,
    origTotalAmount:   origTotal,
    // 옵션
    notes:          target.notes || undefined,
    hideItemPrices: target.pricing_mode !== 'itemized',
    sealImageUrl:   sealTmpPath,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderQuotePdf(pdfData)
  } catch (e) {
    if (sealTmpPath) unlink(sealTmpPath).catch(() => {})
    return NextResponse.json({ error: `PDF 생성 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  } finally {
    if (sealTmpPath) unlink(sealTmpPath).catch(() => {})
  }

  // Supabase Storage 업로드 (유니크 quoteNo이므로 upsert 충돌 없음)
  let pdfUrl: string | null = null
  try {
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
    return NextResponse.json({ error: `Storage 업로드 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  // Google Drive 백업 (non-blocking)
  try {
    const fileName = sanitizeFileName(
      `${quoteNo}_${app.business_name ?? '-'}_${target.label ?? '견적서'}.pdf`,
    )
    await uploadQuoteToDrive(pdfBuffer, fileName)
  } catch (e) {
    console.error('[regenerate-pdf] Drive 업로드 실패 (non-critical):', e)
  }

  // saved_quotes 해당 항목 갱신
  const nowIso = new Date().toISOString()
  const updated = savedQuotes.map(q =>
    q.id === saved_quote_id
      ? { ...q, quote_no: quoteNo, pdf_url: pdfUrl, updated_at: nowIso }
      : q,
  )

  const { error: updateError } = await supabase
    .from('service_applications')
    .update({ saved_quotes: updated })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: `DB 갱신 실패: ${updateError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    quote_no: quoteNo,
    pdf_url: pdfUrl,
    saved_quote_id,
  })
}
