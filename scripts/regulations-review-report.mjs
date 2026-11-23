// 시드 원고의 review_notes 와 [확인: …] 표시를 모아 검토 보고서(markdown)로 만든다.
// 실행: node scripts/regulations-review-report.mjs  → ../../outputs/보고서/회사규정_검토메모_<날짜>.md
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SEED_DIR = 'scripts/regulations-seed'
const OUT_DIR = join('..', '..', 'outputs', '보고서')
const today = new Date().toISOString().slice(0, 10)
const CATEGORY = { legal_hr: '법정·인사', sop: '운영 규정', customer_policy: '고객 약관·정책' }

const seeds = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(SEED_DIR, f), 'utf8')))
  .sort((a, b) => a.code.localeCompare(b.code))

const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
const confirms = (html) => Array.from(plain(html).matchAll(/\[확인:?\s*([^\]]+)\]/g)).map((m) => m[1].trim())
const articleCount = (html) => (html.match(/<strong>\s*제\s*\d+\s*조/g) ?? []).length

const lines = [
  `# 회사 규정 원고 검토 메모 (${today})`,
  '',
  '앱 관리자 > 회사 규정에 편집본으로 들어가 있는 원고의 검토 포인트. 확인 후 화면에서 수정하고 발행한다.',
  '',
  '| 코드 | 규정명 | 분류 | 조 수 | 글자 수 | 확인 표시 |',
  '|---|---|---|---|---|---|',
  ...seeds.map((s) => `| ${s.code} | ${s.title} | ${CATEGORY[s.category] ?? s.category} | ${articleCount(s.html_body)} | ${s.html_body.length} | ${confirms(s.html_body).length} |`),
  '',
]

for (const s of seeds) {
  const marks = confirms(s.html_body)
  lines.push(`## ${s.code} ${s.title}`, '')
  if (s.summary) lines.push(`요약: ${s.summary}`, '')
  if (s.review_notes?.trim()) lines.push('검토 메모:', '', ...s.review_notes.split(/\n+/).map((l) => `- ${l.trim()}`), '')
  if (marks.length) lines.push('본문의 [확인] 표시:', '', ...marks.map((m) => `- ${m}`), '')
  if (!s.review_notes?.trim() && !marks.length) lines.push('검토 메모 없음', '')
}

mkdirSync(OUT_DIR, { recursive: true })
const out = join(OUT_DIR, `회사규정_검토메모_${today}.md`)
writeFileSync(out, lines.join('\n'))
console.log(`생성: ${out} (${seeds.length}건)`)
