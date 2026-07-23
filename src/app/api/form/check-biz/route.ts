import { NextRequest, NextResponse } from 'next/server'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── 옵션 D: 성공 결과 in-memory 캐시 (5분 TTL) ────────────────
// Vercel serverless는 인스턴스별로 유지. 콜드 스타트에는 초기화되지만
// 동일 인스턴스에 재요청이 오는 경우(재시도·연속 조회) 국세청 파도 사이 잡은 성공을 재사용.
interface CachedEntry {
  data: BizStatusResult
  expiresAt: number
}
interface BizStatusResult {
  valid: boolean
  message: string
  status?: string
  taxType?: string
}
const CACHE_TTL_MS = 5 * 60 * 1000 // 5분
const cache = new Map<string, CachedEntry>()

function getCache(key: string): BizStatusResult | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function setCache(key: string, data: BizStatusResult): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  // 캐시 크기 상한 (메모리 폭주 방지)
  if (cache.size > 500) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
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
    const formatValid = checkDigit === parseInt(cleanNumber[9])

    if (!formatValid) {
      return NextResponse.json(
        { success: true, valid: false, message: '유효하지 않은 사업자등록번호입니다.' },
        { status: 200, headers: cors }
      )
    }

    // ─── 옵션 D: 캐시 히트 시 즉시 반환 ─────────────────────────
    const cached = getCache(cleanNumber)
    if (cached) {
      console.log(`check-biz: 캐시 히트 (${cleanNumber})`)
      return NextResponse.json(
        { success: true, ...cached, cached: true },
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

    // ─── 옵션 G: 국세청 실패 시 형식 검증 통과 fallback ─────────
    // 체크디짓까지 통과했고 국세청만 응답 안 하는 상태 → 형식 유효로 진행 허용.
    // 실제 사업자 상태(휴업/폐업)는 계산서 발행 시점에 검증하는 걸로 위임.
    if (!response || !response.ok) {
      console.error(`check-biz: 국세청 API 최종 실패 → fallback (${MAX_RETRIES}회 시도, 마지막 HTTP ${lastStatus})`)
      return NextResponse.json(
        {
          success: true,
          valid: true,
          fallback: true,
          retryable: true,
          message: '형식은 확인되었습니다. 국세청 실시간 조회는 일시 지연 중입니다.\n(계산서 발행 시점에 재확인 예정)',
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

      // ─── 옵션 D: 성공/실패 모두 캐시 (5분간 재조회 방지) ──────
      setCache(cleanNumber, { valid, message, status: statusText, taxType })

      return NextResponse.json(
        { success: true, valid, message, status: statusText, taxType },
        { status: 200, headers: cors }
      )
    }

    // status_code != OK 이지만 응답은 정상 → 미등록 사업자
    setCache(cleanNumber, { valid: false, message: '국세청에 등록되지 않은 사업자번호입니다.' })

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
