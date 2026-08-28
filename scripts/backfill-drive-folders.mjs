#!/usr/bin/env node
// Batch F-Drive-1: Make 웹훅으로 drive_folder_url 누락 회차 백필
// 사용법: node scripts/backfill-drive-folders.mjs
// 사전조건: scripts/_backfill-drive-folders-list.json 에 대상 목록 준비

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIST_PATH = join(__dirname, '_backfill-drive-folders-list.json')
const LOG_PATH  = join(__dirname, '_backfill-drive-folders.log')

const MAKE_WEBHOOK = 'https://hook.eu2.make.com/w4r1ki9j3hx94y6r9t21dlkorjxd797x'
const DELAY_MS = 500 // Make 시나리오 부하 방지, 초당 2건

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function triggerOne(record) {
  const startedAt = Date.now()
  try {
    const res = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:    record.id,
        business_name:     record.business_name,
        construction_date: record.construction_date,
        service_type:      record.service_type,
      }),
    })
    const elapsedMs = Date.now() - startedAt
    return {
      id: record.id,
      biz: record.business_name,
      date: record.construction_date,
      ok: res.ok,
      status: res.status,
      elapsedMs,
    }
  } catch (e) {
    return {
      id: record.id,
      biz: record.business_name,
      date: record.construction_date,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - startedAt,
    }
  }
}

async function main() {
  const records = JSON.parse(readFileSync(LIST_PATH, 'utf-8'))
  const totalCount = records.length
  console.log(`백필 시작: ${totalCount}건, 간격 ${DELAY_MS}ms, 예상 소요 약 ${Math.round((totalCount * DELAY_MS) / 1000)}초`)
  console.log('─'.repeat(80))

  const results = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const result = await triggerOne(r)
    results.push(result)
    const flag = result.ok ? '✅' : '❌'
    const info = result.ok ? `HTTP ${result.status}` : (result.error ?? `HTTP ${result.status}`)
    console.log(`[${String(i + 1).padStart(3)}/${totalCount}] ${flag} ${r.construction_date}  ${(r.business_name ?? '').slice(0, 30).padEnd(30)}  ${info}  (${result.elapsedMs}ms)`)
    if (i < records.length - 1) await sleep(DELAY_MS)
  }

  console.log('─'.repeat(80))
  const okCount = results.filter((r) => r.ok).length
  const failCount = results.length - okCount
  console.log(`웹훅 발사 결과 — 성공: ${okCount} / 실패: ${failCount}`)
  console.log(`(주의: 웹훅 발사 성공은 Make 처리 완료가 아님. 2~3분 후 DB에서 drive_folder_url 채워졌는지 확인 필요)`)

  writeFileSync(LOG_PATH, JSON.stringify({ startedAt: new Date().toISOString(), total: totalCount, ok: okCount, fail: failCount, results }, null, 2), 'utf-8')
  console.log(`상세 로그 저장: ${LOG_PATH}`)
}

main().catch((e) => {
  console.error('스크립트 실패:', e)
  process.exit(1)
})
