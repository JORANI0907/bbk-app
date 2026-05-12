import 'dotenv/config'
import { SolapiMessageService } from 'solapi'

const apiKey    = process.env.SOLAPI_API_KEY
const apiSecret = process.env.SOLAPI_API_SECRET
const from      = process.env.SOLAPI_SENDER_NUMBER   // 031-759-4877

if (!apiKey || !apiSecret || !from) {
  console.error('❌ Solapi 환경변수 누락 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER_NUMBER)')
  process.exit(1)
}

const service = new SolapiMessageService(apiKey, apiSecret)

/**
 * 견적 문자 받을 고객 목록
 * { name: '이름', phone: '010XXXXXXXX' }
 */
const recipients = [
  // { name: '홍길동', phone: '01012345678' },
]

if (recipients.length === 0) {
  console.error('❌ recipients 배열에 수신자를 추가해주세요.')
  process.exit(1)
}

function buildMessage(name) {
  return `[BBK 공간케어] 견적 신청 안내

안녕하세요, ${name}님!
BBK 공간케어입니다.

견적 상담을 위해 아래 내용을
작성하신 후 회신 부탁드립니다 :)

━━━━━━━━━━━━━━━━━
■ 고객명: ${name}
■ 회사명:
■ 연락처:
■ 이메일:
■ 주소:
■ 희망 방문일:
■ 케어 범위:
  (예: 화장실 2개, 주방, 에어컨 3대)
■ 요청사항:
━━━━━━━━━━━━━━━━━

작성 후 이 문자에 회신해 주시면
빠르게 견적을 안내드리겠습니다.

온라인 신청도 가능합니다:
app.bbkorea.co.kr/quote

감사합니다.
BBK 코리아 ☎ 031-759-4877`
}

let successCount = 0
let failCount    = 0

for (const { name, phone } of recipients) {
  try {
    const text = buildMessage(name)
    await service.sendOne({ to: phone, from, text })
    console.log(`✅ ${name} (${phone}) 발송 완료`)
    successCount++
    await new Promise(r => setTimeout(r, 500))
  } catch (err) {
    console.error(`❌ ${name} (${phone}) 발송 실패:`, err.message)
    failCount++
  }
}

console.log(`\n완료: ${successCount}건 성공, ${failCount}건 실패`)
