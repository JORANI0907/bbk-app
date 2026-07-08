import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { UNCLASSIFIED } from '@/lib/finance-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  date: string
  merchant: string
  amount: number
  industry: string
  category: 'fixed' | 'variable'
  name: string        // 가맹점명 그대로 (사용자가 원본 유지 요구)
  group_name: string  // 매입 유형. 매핑 테이블 조회 결과 또는 '미분류'
  include: boolean
}

interface RawRow {
  date: string
  merchant: string
  amount: number
  industry: string
}

// ─── Sheet Parser ─────────────────────────────────────────────────────────────

function normalizeDate(raw: string | number | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  // YYYY.MM.DD → YYYY-MM-DD
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    const date = XLSX.SSF.parse_date_code(Number(s))
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  return s.slice(0, 10)
}

// USD → KRW 실시간 환율 (open.er-api.com, 무료/무키)
async function getUsdRate(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 3600 } })
    const data = await res.json()
    return typeof data?.rates?.KRW === 'number' ? data.rates.KRW : 1400
  } catch {
    return 1400 // 환율 API 실패 시 fallback
  }
}

function parseAmount(raw: string | number | undefined, usdRate = 1400): number {
  if (raw === undefined || raw === null || raw === '') return 0
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw).trim()
  const isDollar = s.startsWith('$')
  const cleaned = s.replace(/[^0-9.-]/g, '')
  const value = Math.abs(parseFloat(cleaned) || 0)
  return isDollar ? Math.round(value * usdRate) : value
}

function parseWorkbook(buffer: ArrayBuffer, fileName: string, usdRate: number): RawRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  // 형식 1: 일시불+할부_카드이용내역조회 (xlsx)
  // → '■ 국내이용내역' 시트, 헤더에 '취소여부' 컬럼
  // '■ 국내이용내역' 시트 검색 — '■ 카드이용내역'과 구분하기 위해 '국내이용내역'만 검색
  const format1Sheet = workbook.SheetNames.find(n => n.includes('국내이용내역'))
  if (format1Sheet) {
    const ws = workbook.Sheets[format1Sheet]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (rows.length > 0 && '취소여부' in rows[0]) {
      return rows
        .filter(r => String(r['취소여부'] ?? '').trim() === '-')
        .map(r => ({
          date: normalizeDate(r['승인일자'] as string | number | undefined),
          merchant: String(r['가맹점명'] ?? '').trim(),
          amount: parseAmount(r['승인금액(원)'] as string | number | undefined, usdRate),
          industry: '',
        }))
        .filter(r => r.merchant && r.amount > 0)
    }
  }

  // 형식 2: 승인내역조회 (xls)
  // → Sheet1, 헤더에 '상태', '업종명' 컬럼
  const format2Sheet = workbook.SheetNames[0]
  if (format2Sheet) {
    const ws = workbook.Sheets[format2Sheet]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (rows.length > 0 && '상태' in rows[0]) {
      return rows
        .filter(r => String(r['상태'] ?? '').trim() === '정상')
        .map(r => ({
          date: normalizeDate(r['승인일'] as string | number | undefined),
          merchant: String(r['가맹점명'] ?? '').trim(),
          amount: parseAmount(r['승인금액'] as string | number | undefined, usdRate),
          industry: String(r['업종명'] ?? '').trim(),
        }))
        .filter(r => r.merchant && r.amount > 0)
    }
  }

  throw new Error(`지원하지 않는 파일 형식입니다. (파일: ${fileName})\n일시불+할부_카드이용내역조회 또는 승인내역조회 형식만 지원합니다.`)
}

// ─── AI Classifier ────────────────────────────────────────────────────────────

// 카드 내역의 category(고정비/변동비)만 AI 로 판정. 항목명은 원본 가맹점명 그대로 유지.
// 매입 유형(group_name)은 매핑 테이블에서 조회하고, AI 는 여기 관여하지 않음.
const CLASSIFY_PROMPT = `당신은 법인 카드 사용 내역을 고정비/변동비로 분류하는 회계 전문가입니다.

분류 기준:
- 고정비(fixed): 매월 일정하게 발생하는 비용 (임대료, 통신비, 보험료, 소프트웨어 구독, 인터넷 등)
- 변동비(variable): 월별로 변동하는 비용 (자재비, 소모품, 교통비, 식대, 주차, 쇼핑, 기타 등)

각 항목을 fixed / variable 로만 분류. 항목명은 별도로 만들지 마세요.

JSON 배열만 반환 (마크다운 코드블록 없이):
[{"index":0,"category":"fixed"},...]`

async function classifyWithAI(rawRows: RawRow[]): Promise<Array<{ category: 'fixed' | 'variable' }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return rawRows.map(() => ({ category: 'variable' as const }))

  const client = new Anthropic({ apiKey })
  const items = rawRows.map((r, i) => `${i}. 가맹점: ${r.merchant}${r.industry ? ` / 업종: ${r.industry}` : ''} / 금액: ${r.amount.toLocaleString()}원`)

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `${CLASSIFY_PROMPT}\n\n${items.join('\n')}` }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const results = JSON.parse(text) as Array<{ index: number; category: 'fixed' | 'variable' }>

    const classified: Array<{ category: 'fixed' | 'variable' }> = rawRows.map(() => ({ category: 'variable' as const }))
    for (const r of results) {
      if (r.index >= 0 && r.index < classified.length) {
        classified[r.index] = { category: r.category }
      }
    }
    return classified
  } catch {
    return rawRows.map(() => ({ category: 'variable' as const }))
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const month = formData.get('month') as string | null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!month) return NextResponse.json({ error: 'month가 필요합니다.' }, { status: 400 })

    const [buffer, usdRate] = await Promise.all([
      file.arrayBuffer(),
      getUsdRate(),
    ])
    const rawRows = parseWorkbook(buffer, file.name, usdRate)

    if (rawRows.length === 0) return NextResponse.json({ error: '분석할 데이터가 없습니다.' }, { status: 400 })

    // AI 분류 (최대 100건) — category(고정비/변동비)만 결정
    const limited = rawRows.slice(0, 100)
    const classified = await classifyWithAI(limited)

    // 매핑 테이블 조회 후 (category, name) 별 group_name 자동 세팅 — 매칭 없으면 미분류
    const supabase = createServiceClient()
    const { data: mappings } = await supabase
      .from('finance_type_mappings')
      .select('category, name, group_name')
    const mappingKey = (cat: string, name: string) => `${cat}::${name}`
    const mappingMap = new Map<string, string>()
    for (const m of mappings ?? []) {
      mappingMap.set(mappingKey(m.category, m.name), m.group_name)
    }

    const parsedRows: ParsedRow[] = limited.map((r, i) => {
      const category = classified[i].category
      const name = r.merchant // 원본 그대로
      const group_name = mappingMap.get(mappingKey(category, name)) ?? UNCLASSIFIED
      return {
        ...r,
        category,
        name,
        group_name,
        include: true,
      }
    })

    return NextResponse.json({ rows: parsedRows, total: rawRows.length, usdRate })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '파싱 실패'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
