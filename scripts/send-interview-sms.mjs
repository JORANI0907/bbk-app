import 'dotenv/config'
import { SolapiMessageService } from 'solapi'

const apiKey = process.env.SOLAPI_API_KEY
const apiSecret = process.env.SOLAPI_API_SECRET
const from = process.env.SOLAPI_SENDER_NUMBER

if (!apiKey || !apiSecret || !from) {
  console.error('Solapi 환경변수 누락')
  process.exit(1)
}

const service = new SolapiMessageService(apiKey, apiSecret)

const PLACE = '경기 성남시 중원구 둔촌대로268번길 22 (하대원동) 201호'
const CONTACT = '010-5434-4877'
const DEADLINE = '5월 12일(월) 12시'

const applicants = [
  { name: '김승수', phone: '01025080153', date: '5월 13일(수)', time: '오후 1시' },
  { name: '홍대식', phone: '01044076650', date: '5월 13일(수)', time: '오후 2시' },
  { name: '이종우', phone: '01037157233', date: '5월 13일(수)', time: '오후 3시' },
  { name: '조종호', phone: '01076182563', date: '5월 14일(목)', time: '오후 1시' },
  { name: '김태현', phone: '01039044377', date: '5월 14일(목)', time: '오후 2시' },
  { name: '안성우', phone: '01053352052', date: '5월 14일(목)', time: '오후 3시' },
  { name: '박호균', phone: '01048492923', date: '5월 15일(금)', time: '오후 1시' },
  { name: '김용훈', phone: '01020415607', date: '5월 15일(금)', time: '오후 2시' },
  { name: '김찬중', phone: '01021692057', date: '5월 15일(금)', time: '오후 3시' },
]

function buildMessage(name, date, time) {
  return `[범빌드코리아] 안녕하세요, ${name}님.
야간 상가 대청소 팀장 지원해 주셔서 감사합니다.
면접 대상자로 선정되어 일정을 안내드립니다.

일시: ${date} ${time}
장소: ${PLACE}

참석 여부를 ${DEADLINE}까지 회신 부탁드립니다.
문의: ${CONTACT}

감사합니다. 범빌드코리아 드림`
}

let successCount = 0
let failCount = 0

for (const { name, phone, date, time } of applicants) {
  try {
    const text = buildMessage(name, date, time)
    await service.sendOne({ to: phone, from, text })
    console.log(`✅ ${name} (${phone}) 발송 완료`)
    successCount++
    await new Promise(r => setTimeout(r, 500))
  } catch (err) {
    console.error(`❌ ${name} (${phone}) 발송 실패:`, err.message)
    failCount++
  }
}

console.log(`\n발송 완료: ${successCount}건 성공, ${failCount}건 실패`)
