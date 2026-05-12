import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { condition_score, customer_memo, drive_folder_url } = body

  const updates: Record<string, unknown> = {}
  if (condition_score !== undefined) updates.condition_score = condition_score
  if (customer_memo !== undefined) updates.customer_memo = customer_memo
  if (drive_folder_url !== undefined) updates.drive_folder_url = drive_folder_url

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('service_applications')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
