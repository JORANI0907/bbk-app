/**
 * Solapi 카카오 알림톡 카테고리 코드 조회 + 기존 템플릿 목록 조회 (읽기 전용)
 */
import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'

const apiKey = process.env.SOLAPI_API_KEY
const apiSecret = process.env.SOLAPI_API_SECRET

function buildAuthHeader() {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

async function callGet(path) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader(),
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  // 1) 카테고리 조회 및 결제·서비스 관련 필터
  console.log('[1] 카테고리 조회 중...')
  const categories = await callGet('/kakao/v1/categories')
  await fs.writeFile('scripts/_kakao-categories.json', JSON.stringify(categories, null, 2), 'utf8')

  const keywords = ['결제', '예약', '서비스이용', '주문', '배송', '접수', '완료', '안내']
  const filtered = categories.filter((c) =>
    keywords.some((k) => c.name.includes(k)),
  )

  console.log(`\n[결제·서비스이용 관련 ${filtered.length}개]\n`)
  filtered.forEach((c) => console.log(`${c.code}  ${c.name}`))

  // 2) 기존 등록된 템플릿 조회
  console.log('\n[2] 기존 등록 템플릿 조회 중...')
  const templates = await callGet('/kakao/v2/templates?limit=100')
  await fs.writeFile('scripts/_kakao-templates-existing.json', JSON.stringify(templates, null, 2), 'utf8')

  const list = templates.templateList ?? []
  console.log(`\n[기존 등록 템플릿 ${list.length}개]\n`)
  list.forEach((t) => {
    console.log(`- ${t.name}  [${t.status ?? 'unknown'}]  categoryCode=${t.categoryCode ?? '-'}`)
  })

  // 3) 채널 조회
  console.log('\n[3] 채널 조회 중...')
  const channels = await callGet('/kakao/v2/channels')
  console.log(`\n[등록된 채널]`)
  ;(channels.channelList ?? []).forEach((ch) => {
    console.log(`- ${ch.channelName}  channelId=${ch.channelId}  searchId=${ch.searchId}  status=${ch.status ?? '-'}`)
  })
}

main().catch((e) => {
  console.error('오류:', e.message)
  process.exit(1)
})
