/**
 * thumbnail-generator.js
 *
 * THUMBNAIL.md 규칙 기반 썸네일 생성
 * compositor (localhost:5050/generate) 호출
 *
 * 스타일 순환 (월/수/금):
 *   월(1): bold  + yellow
 *   수(3): poster + cyan
 *   금(5): clean  + pink
 */

const http = require('http')

const COMPOSITOR_URL = 'http://localhost:5050/generate'

// 요일(KST 기준) → 스타일 매핑
const DOW_STYLE = {
  1: { type: 'bold',   color: 'yellow' },  // 월
  3: { type: 'poster', color: 'cyan'   },  // 수
  5: { type: 'clean',  color: 'pink'   },  // 금
}

function getDowKST() {
  // VPS는 UTC — KST(+9) 기준 요일 반환
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return now.getUTCDay() // 0=일, 1=월 ... 6=토
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      port:     u.port || 80,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }
    const req = http.request(options, res => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('Compositor error ' + res.statusCode + ': ' + raw))
        } else {
          try { resolve(JSON.parse(raw)) }
          catch { resolve({ raw }) }
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(new Error('Compositor timeout')) })
    req.write(data)
    req.end()
  })
}

/**
 * @param {{ item: string, region: string, title?: string, bgUrl?: string }} params
 * @returns {Promise<Buffer>} PNG 버퍼
 */
async function generateThumbnail({ item, region, title, bgUrl }) {
  const dow = getDowKST()
  const style = DOW_STYLE[dow] || DOW_STYLE[1]

  const mainText = title || (region + ' ' + item + ' 청소')

  console.log('[thumbnail] 스타일:', style.type, '/', style.color, '| 요일:', dow)

  const payload = {
    title:  mainText,
    sub:    region + ' 전문 청소업체 BBK',
    region: region,
    item:   item,
    color:  style.color,
    type:   style.type,
    trigger_type: 'auto',
  }

  if (bgUrl) {
    payload.bg_url = bgUrl
  }

  const result = await postJSON(COMPOSITOR_URL, payload)

  if (!result.ok || !result.result_base64) {
    throw new Error('Compositor 응답 오류: ' + JSON.stringify(result))
  }

  console.log('[thumbnail] 생성 완료:', result.filename)
  return Buffer.from(result.result_base64, 'base64')
}

module.exports = { generateThumbnail }
