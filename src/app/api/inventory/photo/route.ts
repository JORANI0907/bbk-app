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
  // Supabase Storage 키는 ASCII만 허용 (한글 등 비ASCII → Invalid key 에러)
  // 품목명/작업자명은 DB transaction 레코드에 별도 저장되므로 파일 경로에는 포함 안 함.
  const rawExt = file.name.split('.').pop() ?? 'jpg'
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const safeType = /^[a-zA-Z0-9_-]+$/.test(txType) ? txType : 'other'
  const rand = Math.random().toString(36).slice(2, 10)
  const fileName = `${safeType}/${Date.now()}_${rand}.${ext}`
  void itemName  // item_name은 DB에 기록 (Storage key에는 포함 안 함)

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
      return NextResponse.json({
        error: `업로드 실패: ${uploadError.message}`,
        statusCode: uploadError.statusCode ?? null,
      }, { status: 500 })
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
