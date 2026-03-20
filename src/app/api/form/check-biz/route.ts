import { NextRequest, NextResponse } from 'next/server'

const NTS_SERVICE_KEY =
  process.env.NTS_SERVICE_KEY ??
  'a47e34988c57e2ad1af19a225e999728476b3ce08326c51046c58eb807c5c0d3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors })
}

export async function POST(req: NextRequest) {
  try {
    const { businessNumber } = await req.json()

    if (!businessNumber) {
      return NextResponse.json(
        { success: false, message: '사업자등록번호를 입력해주세요.' },
        { status: 400, headers: cors }
      )
    }

    const cleanNumber = businessNumber.replace(/-/g, '')

    if (!/^\d{10}$/.test(cleanNumber)) {
      return NextResponse.json(
        { success: true, valid: false, message: '사업자등록번호는 10자리 숫자여야 합니다.' },
        { status: 200, headers: cors }
      )
    }

    // 체크디짓 검증
    const checkKeys = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    let sum = 0
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanNumber[i]) * checkKeys[i]
    }
    sum += Math.floor((parseInt(cleanNumber[8]) * 5) / 10)
    const checkDigit = (10 - (sum % 10)) % 10

    if (checkDigit !== parseInt(cleanNumber[9])) {
      return NextResponse.json(
        { success: true, valid: false, message: '유효하지 않은 사업자등록번호입니다.' },
        { status: 200, headers: cors }
      )
    }

    // 국세청 API 호출
    const apiUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(NTS_SERVICE_KEY)}`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: [cleanNumber] }),
    })

    const result = await response.json()

    if (result.status_code === 'OK' && result.data?.length > 0) {
      const bizInfo = result.data[0]
      const statusCode = bizInfo.b_stt_cd
      const statusText: string = bizInfo.b_stt || '알 수 없음'
      const taxType: string = bizInfo.tax_type || ''

      let valid = false
      let message = ''

      if (statusCode === '01') {
        valid = true
        message = `정상 사업자 (${statusText}, ${taxType})`
      } else if (statusCode === '02') {
        message = `휴업자입니다. (${statusText})`
      } else if (statusCode === '03') {
        message = `폐업자입니다. (${statusText}, 폐업일: ${bizInfo.end_dt || '정보없음'})`
      } else {
        message = '국세청에 등록되지 않은 사업자번호입니다.'
      }

      return NextResponse.json(
        { success: true, valid, message, status: statusText, taxType },
        { status: 200, headers: cors }
      )
    }

    return NextResponse.json(
      { success: true, valid: false, message: '국세청에 등록되지 않은 사업자번호입니다.' },
      { status: 200, headers: cors }
    )
  } catch (error) {
    console.error('check-biz error:', error)
    return NextResponse.json(
      { success: false, message: '조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500, headers: cors }
    )
  }
}
