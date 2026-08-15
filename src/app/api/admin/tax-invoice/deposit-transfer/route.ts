/**
 * 예약금 이체 xls 다운로드
 * POST /api/admin/tax-invoice/deposit-transfer
 *
 * Body (optional): { ids?: string[] }
 *  - ids: source_id 목록. 없으면 카드결제 대상 전체.
 *
 * Response: application/vnd.ms-excel
 *   Header X-Skipped-Count: <number> (파싱 실패 건수)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import {
  buildDepositTransferXls,
  CARD_PAYMENT_METHOD,
  type DepositCandidate,
} from '@/lib/tax-invoice/deposit-transfer'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] }
    const ids = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : null

    const supabase = createServiceClient()

    // customers 테이블에서 카드결제 대상 조회
    let query = supabase
      .from('customers')
      .select('business_name, contact_name, payment_method, account_number')
      .eq('payment_method', CARD_PAYMENT_METHOD)
      .is('deleted_at', null)
      .is('archived_at', null)

    if (ids) {
      // ids는 source_id (application.id 또는 billing.id) — customer 단위로 필터 불가.
      // 단, 호출부가 customer_id를 넘기는 경우도 고려해 id 필터 적용.
      query = supabase
        .from('customers')
        .select('business_name, contact_name, payment_method, account_number')
        .eq('payment_method', CARD_PAYMENT_METHOD)
        .is('deleted_at', null)
        .is('archived_at', null)
        .in('id', ids)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const candidates: DepositCandidate[] = (data ?? []).map(row => ({
      business_name: row.business_name as string,
      contact_name: row.contact_name as string | null,
      payment_method: row.payment_method as string | null,
      account_number: row.account_number as string | null,
    }))

    const { buffer, skipped } = await buildDepositTransferXls(candidates)

    const today = new Date()
      .toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Seoul',
      })
      .replace(/\. /g, '-')
      .replace('.', '')

    const fileName = `예약금이체_${today}.xls`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'X-Skipped-Count': String(skipped.length),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '예약금이체 xls 생성 실패' },
      { status: 500 },
    )
  }
}
