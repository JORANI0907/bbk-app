// 회사 규정 시드: scripts/regulations-seed/*.json → regulations / regulation_versions (draft)
// 실행: node scripts/seed-regulations.mjs                 → 계획만 출력
//       node scripts/seed-regulations.mjs --apply         → 반영 (draft 로 저장, 관리자 화면에서 검토 후 발행)
//       node scripts/seed-regulations.mjs --apply --publish → 반영 + 즉시 발행 (effective_date 기준)
//       node scripts/seed-regulations.mjs --apply --only HR-01,OP-03
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

config({ path: '.env.local', override: true })
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE env 누락')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const PUBLISH = args.includes('--publish')
const onlyIdx = args.indexOf('--only')
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',').map((s) => s.trim().toUpperCase())) : null
const SEED_DIR = 'scripts/regulations-seed'

const CATEGORIES = new Set(['legal_hr', 'sop', 'customer_policy'])
const VISIBILITIES = new Set(['admin', 'worker', 'customer', 'public'])
const CODE_RE = /^[A-Z]{2,4}-\d{2,3}$/

function loadSeeds() {
  return readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(SEED_DIR, f), 'utf8')) }))
    .filter((s) => !ONLY || ONLY.has(s.code))
    .sort((a, b) => a.code.localeCompare(b.code))
}

function validate(seed) {
  const errors = []
  if (!CODE_RE.test(seed.code ?? '')) errors.push('code 형식')
  if (!seed.title?.trim()) errors.push('title 없음')
  if (!CATEGORIES.has(seed.category)) errors.push('category 값')
  if (!VISIBILITIES.has(seed.visibility)) errors.push('visibility 값')
  if (!seed.html_body?.trim()) errors.push('html_body 없음')
  if (/<(html|head|body|style)\b/i.test(seed.html_body ?? '')) errors.push('html_body 에 문서 태그 포함')
  if (!/제\s*1\s*조/.test(seed.html_body ?? '')) errors.push('제1조 없음')
  if (!/\{\{\s*시행일\s*\}\}/.test(seed.html_body ?? '')) errors.push('{{시행일}} 없음')
  return errors
}

function articleCount(html) {
  return (html.match(/<strong>\s*제\s*\d+\s*조/g) ?? []).length
}

async function must(promise, label) {
  const { data, error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function upsertRegulation(supabase, seed) {
  const existing = await must(
    supabase.from('regulations').select('id, current_version_id').eq('code', seed.code).is('deleted_at', null).maybeSingle(),
    `${seed.code} 조회`,
  )
  const meta = { title: seed.title, category: seed.category, visibility: seed.visibility, summary: seed.summary ?? null }
  if (existing) {
    await must(supabase.from('regulations').update(meta).eq('id', existing.id), `${seed.code} 메타 갱신`)
    return { id: existing.id, created: false }
  }
  const row = await must(
    supabase.from('regulations').insert({ code: seed.code, ...meta, status: 'draft' }).select('id').single(),
    `${seed.code} 생성`,
  )
  return { id: row.id, created: true }
}

async function upsertDraft(supabase, regulationId, seed) {
  const draft = await must(
    supabase.from('regulation_versions').select('id, version_no').eq('regulation_id', regulationId).eq('status', 'draft').maybeSingle(),
    `${seed.code} draft 조회`,
  )
  const payload = { html_body: seed.html_body, change_summary: seed.change_summary ?? '제정', effective_date: seed.effective_date ?? null, review_notes: seed.review_notes?.trim() || null }
  if (draft) {
    await must(supabase.from('regulation_versions').update(payload).eq('id', draft.id), `${seed.code} draft 갱신`)
    return draft
  }
  const last = await must(
    supabase.from('regulation_versions').select('version_no').eq('regulation_id', regulationId).order('version_no', { ascending: false }).limit(1).maybeSingle(),
    `${seed.code} 마지막 버전`,
  )
  return must(
    supabase.from('regulation_versions').insert({ regulation_id: regulationId, version_no: (last?.version_no ?? 0) + 1, status: 'draft', ...payload }).select('id, version_no').single(),
    `${seed.code} draft 생성`,
  )
}

async function publishDraft(supabase, regulationId, draft, seed) {
  if (!seed.effective_date) throw new Error(`${seed.code}: 발행하려면 effective_date 가 필요합니다`)
  const now = new Date().toISOString()
  await must(
    supabase.from('regulation_versions').update({ status: 'published', published_at: now, published_by: 'seed-script', effective_date: seed.effective_date }).eq('id', draft.id),
    `${seed.code} 발행`,
  )
  await must(supabase.from('regulations').update({ current_version_id: draft.id, status: 'active' }).eq('id', regulationId), `${seed.code} 현재본 지정`)
}

const seeds = loadSeeds()
let invalid = 0
for (const s of seeds) {
  const errors = validate(s)
  if (errors.length) invalid++
  console.log(`${errors.length ? '✗' : '✓'} ${s.code} ${s.title} — ${articleCount(s.html_body ?? '')}개 조, ${(s.html_body ?? '').length}자${errors.length ? ` [오류: ${errors.join(', ')}]` : ''}`)
}
if (invalid) { console.error(`\n오류 ${invalid}건. 수정 후 다시 실행하세요.`); process.exit(1) }
if (!APPLY) { console.log('\n(dry-run) --apply 로 반영, --publish 를 더하면 즉시 발행'); process.exit(0) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
for (const seed of seeds) {
  const reg = await upsertRegulation(supabase, seed)
  const draft = await upsertDraft(supabase, reg.id, seed)
  if (PUBLISH) await publishDraft(supabase, reg.id, draft, seed)
  console.log(`${reg.created ? '생성' : '갱신'} ${seed.code} → 제${draft.version_no}판 ${PUBLISH ? '발행' : 'draft'} (${reg.id})`)
}
console.log('\n완료')
