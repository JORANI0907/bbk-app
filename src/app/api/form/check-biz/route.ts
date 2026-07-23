import { NextRequest, NextResponse } from 'next/server'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors })
}

export async function POST(req: NextRequest) {
  const NTS_SERVICE_KEY = process.env.NTS_SERVICE_KEY

  if (!NTS_SERVICE_KEY) {
    console.error('check-biz: NTS_SERVICE_KEY 환경변수가 설정되지 않았습니다.')
    return NextResponse.json(
      { success: false, message: '서비스 설정 오류입니다. 관리자에게 문의해주세요.' },
      { status: 500, headers: cors }
    )
  }

  try {
    const { businessNumber } = await req.json()

    if (!businessNumber) {
      return NextResponse.json(
        { success: false, message: '사업자등록번호를 입력해주세요.' },
        { status: 400, headers: cors }
      )
    }

    const cleanNumber = (businessNumber as string).replace(/-/g, '')

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

    // 국세청 공공데이터포털 API 호출
    // 공공데이터포털이 간헐적으로 5xx를 반환하므로 최대 3회 자동 재시도 (지수 백오프)
    const apiUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(NTS_SERVICE_KEY)}`
    const MAX_RETRIES = 3
    let response: Response | null = null
    let lastStatus = 0
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ b_no: [cleanNumber] }),
        })
        if (response.ok) {
          if (attempt > 1) console.log(`check-biz: 재시도 성공 (${attempt}회차)`)
          break
        }
        lastStatus = response.status
        console.warn(`check-biz: 국세청 API HTTP ${response.status} (시도 ${attempt}/${MAX_RETRIES})`)
        // 4xx는 재시도해도 의미 없음 → 즉시 중단
        if (response.status >= 400 && response.status < 500) break
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        console.warn(`check-biz: 네트워크 오류 (시도 ${attempt}/${MAX_RETRIES}): ${msg}`)
      }
      // 지수 백오프: 400ms, 800ms
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 400 * attempt))
      }
    }

    if (!response || !response.ok) {
      console.error(`check-biz: 국세청 API 최종 실패 (${MAX_RETRIES}회 시도, 마지막 HTTP ${lastStatus})`)
      return NextResponse.json(
        {
          success: false,
          retryable: true,
          message: '국세청 시스템이 일시적으로 응답하지 않습니다.\n10~20초 후 다시 시도하거나, "사업자등록 전" 옵션을 이용해주세요.',
        },
        { status: 200, headers: cors }
      )
    }

    const result = await response.json()

    // API 인증 실패 처리
    if (result.returnAuthMsg || result.returnReasonCode) {
      console.error('check-biz: 국세청 API 인증 실패', result)
      return NextResponse.json(
        { success: false, message: '국세청 API 인증 오류입니다. 관리자에게 문의해주세요.' },
        { status: 200, headers: cors }
      )
    }

    if (result.status_code === 'OK' && result.data?.length > 0) {
      const bizInfo = result.data[0]
      const statusCode: string = bizInfo.b_stt_cd
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
