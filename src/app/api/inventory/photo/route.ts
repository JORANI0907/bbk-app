import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'inventory-photos'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const TX_LABEL: Record<string, string> = {
  use: '수령',
  return: '반납',
  receive: '입고',
  adjust: '조정',
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  const itemName = (formData.get('item_name') as string | null) ?? '재고'
  const txType = (formData.get('tx_type') as string | null) ?? ''

  if (!file) {
    return NextResponse.json({ error: 'photo 파일이 필요합니다.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 })
  }

  const typeLabel = TX_LABEL[txType] ?? txType
  const workerName = session.name ?? '직원'
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${txType}/${itemName}_${workerName}_${Date.now()}.${ext}`

  try {
    const supabase = createServiceClient()
    const fileBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `업로드 실패: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl, type_label: typeLabel })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 },
    )
  }
}
