import { NextRequest, NextResponse } from 'next/server'

const KEYS: Record<string, string | undefined> = {
  bbk: process.env.JUSO_API_KEY_BBK_CARE,
  quote: process.env.JUSO_API_KEY_QUOTE,
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()
  const type = searchParams.get('type')

  if (!keyword || !type || !KEYS[type]) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const url = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do')
  url.searchParams.set('currentPage', '1')
  url.searchParams.set('countPerPage', '10')
  url.searchParams.set('keyword', keyword)
  url.searchParams.set('confmKey', KEYS[type]!)
  url.searchParams.set('resultType', 'json')

  try {
    const res = await fetch(url.toString())
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '주소 검색 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
