/**
 * customers 테이블 좌표 백필 스크립트
 * - latitude/longitude가 NULL인 행을 카카오 로컬 API로 지오코딩
 * - 3단계 fallback: 원본 → 정제(괄호제거) → 코어주소(도로명만)
 * - 실패 건은 scripts/_geocode-failures.csv 에 저장
 *
 * 실행: node scripts/geocode-customers.mjs
 * 필요 env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'

// Next.js 컨벤션에 맞춰 .env.local 우선 로드 (없으면 .env)
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !KAKAO_REST_API_KEY) {
  console.error('❌ 필수 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const REQUEST_DELAY_MS = 150 // 카카오 API rate limit 고려

function cleanAddress(raw) {
  if (!raw || typeof raw !== 'string') return null
  // 인코딩 깨짐 감지 (한글 대체문자)
  if (/[�□]|�/.test(raw)) return null

  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ') // 괄호 안 내용 제거
    .replace(/\s+/g, ' ')
    .trim()

  // 최소 3단어 이상 있어야 유효 (시/도 + 시/구 + 도로/동 + 번지 정도)
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length < 2) return null

  return cleaned
}

function extractCoreAddress(cleaned) {
  // "서울특별시 관악구 대학7길 2 대로변 1층 상가 함박이요" → "서울특별시 관악구 대학7길 2"
  // 도로명(로/길) + 숫자, 또는 동 + 지번숫자까지만 추출
  const roadMatch = cleaned.match(/^(.+?(?:로|길|동|가)\s*\d+(?:-\d+)?(?:번길\s*\d+(?:-\d+)?)?)/)
  if (roadMatch) return roadMatch[1].trim()
  return cleaned
}

async function geocode(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const doc = data.documents?.[0]
    if (!doc) return null
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      matched: doc.address_name,
    }
  } catch (err) {
    console.error(`API 오류: ${err.message}`)
    return null
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log('[1] 좌표 없는 고객사 조회...')
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, address, address_detail')
    .is('latitude', null)
    .not('address', 'is', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  console.log(`대상: ${customers.length}건\n`)

  const failures = []
  let success = 0
  let skipped = 0

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i]
    const progress = `[${i + 1}/${customers.length}]`
    const name = (c.business_name || '(이름없음)').slice(0, 20)

    const cleaned = cleanAddress(c.address)
    if (!cleaned) {
      console.log(`${progress} ⏭️  스킵: ${name} — ${(c.address || '').slice(0, 40)}`)
      skipped++
      failures.push({ id: c.id, business_name: c.business_name, address: c.address, reason: 'invalid_address' })
      continue
    }

    // 1차: 정제된 주소
    let result = await geocode(cleaned)

    // 2차: 코어 주소만
    if (!result) {
      const core = extractCoreAddress(cleaned)
      if (core !== cleaned) {
        await sleep(REQUEST_DELAY_MS)
        result = await geocode(core)
      }
    }

    if (result) {
      const { error: updateError } = await supabase
        .from('customers')
        .update({ latitude: result.lat, longitude: result.lng })
        .eq('id', c.id)

      if (updateError) {
        console.log(`${progress} ❌ UPDATE 실패: ${name} — ${updateError.message}`)
        failures.push({ id: c.id, business_name: c.business_name, address: c.address, reason: 'update_error' })
      } else {
        console.log(`${progress} ✅ ${name} → ${result.matched}`)
        success++
      }
    } else {
      console.log(`${progress} ❌ 지오코딩 실패: ${name} — ${cleaned.slice(0, 40)}`)
      failures.push({ id: c.id, business_name: c.business_name, address: c.address, reason: 'geocode_failed' })
    }

    await sleep(REQUEST_DELAY_MS)
  }

  // 실패 로그 CSV 저장
  if (failures.length > 0) {
    const csv =
      'id,business_name,address,reason\n' +
      failures
        .map((f) => {
          const esc = (v) => `"${(v || '').toString().replace(/"/g, '""')}"`
          return `${esc(f.id)},${esc(f.business_name)},${esc(f.address)},${esc(f.reason)}`
        })
        .join('\n')
    await fs.writeFile('scripts/_geocode-failures.csv', csv, 'utf8')
  }

  console.log(`\n===== 완료 =====`)
  console.log(`✅ 성공  : ${success}건`)
  console.log(`⏭️  스킵  : ${skipped}건 (인코딩 깨짐/시단위만)`)
  console.log(`❌ 실패  : ${failures.length - skipped}건 (지오코딩 매칭 없음)`)
  if (failures.length > 0) {
    console.log(`\n실패 목록: scripts/_geocode-failures.csv (수동 검토 대상)`)
  }
}

main().catch((err) => {
  console.error('스크립트 실패:', err)
  process.exit(1)
})
