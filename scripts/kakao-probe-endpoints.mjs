/**
 * Solapi 카카오 알림톡 관련 엔드포인트 탐색 (읽기 전용)
 */
import 'dotenv/config'
import crypto from 'node:crypto'

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

const endpoints = [
  '/kakao/v2/channels',
  '/kakao/v1/categories',
  '/kakao/v2/categories',
  '/kakao/v2/templates',
  '/kakao/v1/templates',
  '/kakao/v1/channels',
  '/kakao/v2/templates?limit=1',
  '/users/v1/account',
]

async function probe(path) {
  try {
    const res = await fetch(`https://api.solapi.com${path}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(),
        'Content-Type': 'application/json',
      },
    })
    const text = await res.text()
    const preview = text.length > 200 ? text.slice(0, 200) + '...' : text
    console.log(`${res.status.toString().padEnd(4)} GET ${path}`)
    console.log(`     ${preview.replace(/\n/g, ' ')}`)
    console.log()
  } catch (e) {
    console.log(`ERR  GET ${path} — ${e.message}`)
  }
}

for (const p of endpoints) {
  await probe(p)
}
