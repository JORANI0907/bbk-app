import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import Anthropic from '@anthropic-ai/sdk'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  date: string
  merchant: string
  amount: number
  industry: string
  category: 'fixed' | 'variable'
  name: string
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

function parseAmount(raw: string | number | undefined): number {
  if (raw === undefined || raw === null || raw === '') return 0
  if (typeof raw === 'number') return Math.abs(raw)
  // '$1.33' 같은 해외 통화 제거 후 파싱
  const cleaned = String(raw).replace(/[^0-9.-]/g, '')
  return Math.abs(parseFloat(cleaned) || 0)
}

function parseWorkbook(buffer: ArrayBuffer, fileName: string): RawRow[] {
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
          amount: parseAmount(r['승인금액(원)'] as string | number | undefined),
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
        .filter(r => String(r['승인구분'] ?? '').trim() !== '해외') // 해외 결제 제외
        .map(r => ({
          date: normalizeDate(r['승인일'] as string | number | undefined),
          merchant: String(r['가맹점명'] ?? '').trim(),
          amount: parseAmount(r['승인금액'] as string | number | undefined),
          industry: String(r['업종명'] ?? '').trim(),
        }))
        .filter(r => r.merchant && r.amount > 0)
    }
  }

  throw new Error(`지원하지 않는 파일 형식입니다. (파일: ${fileName})\n일시불+할부_카드이용내역조회 또는 승인내역조회 형식만 지원합니다.`)
}

// ─── AI Classifier ────────────────────────────────────────────────────────────

const CLASSIFY_PROMPT = `당신은 법인 카드 사용 내역을 분류하는 회계 전문가입니다.
아래 카드 사용 내역을 고정비 또는 변동비로 분류하고, 적절한 항목명을 제안해주세요.

분류 기준:
- 고정비(fixed): 매월 일정하게 발생하는 비용 (임대료, 통신비, 보험료, 소프트웨어 구독, 인터넷, 전기가스 등)
- 변동비(variable): 월별로 변동하는 비용 (자재비, 소모품, 교통비, 식대, 주차, 쇼핑, 기타 등)

항목명 작성 규칙:
- 간결하고 명확하게 (최대 20자)
- 가맹점명을 그대로 쓰지 말고 비용 성격을 설명
- 예: "쿠팡비즈" → "자재비", "KT 통신" → "통신비", "이디야커피" → "업무 식대"

JSON 배열만 반환 (마크다운 코드블록 없이):
[{"index":0,"category":"fixed","name":"항목명"},...]`

async function classifyWithAI(rawRows: RawRow[]): Promise<Array<{ category: 'fixed' | 'variable'; name: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return rawRows.map(r => ({ category: 'variable' as const, name: r.merchant.slice(0, 20) }))

  const client = new Anthropic({ apiKey })
  const items = rawRows.map((r, i) => `${i}. 가맹점: ${r.merchant}${r.industry ? ` / 업종: ${r.industry}` : ''} / 금액: ${r.amount.toLocaleString()}원`)

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `${CLASSIFY_PROMPT}\n\n${items.join('\n')}` }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const results = JSON.parse(text) as Array<{ index: number; category: 'fixed' | 'variable'; name: string }>

    const classified: Array<{ category: 'fixed' | 'variable'; name: string }> = rawRows.map(r => ({ category: 'variable' as const, name: r.merchant.slice(0, 20) }))
    for (const r of results) {
      if (r.index >= 0 && r.index < classified.length) {
        classified[r.index] = { category: r.category, name: r.name.slice(0, 20) }
      }
    }
    return classified
  } catch {
    return rawRows.map(r => ({ category: 'variable' as const, name: r.merchant.slice(0, 20) }))
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

    const buffer = await file.arrayBuffer()
    const rawRows = parseWorkbook(buffer, file.name)

    if (rawRows.length === 0) return NextResponse.json({ error: '분석할 데이터가 없습니다.' }, { status: 400 })

    // AI 분류 (최대 100건)
    const limited = rawRows.slice(0, 100)
    const classified = await classifyWithAI(limited)

    const parsedRows: ParsedRow[] = limited.map((r, i) => ({
      ...r,
      category: classified[i].category,
      name: classified[i].name,
      include: true,
    }))

    return NextResponse.json({ rows: parsedRows, total: rawRows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '파싱 실패'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
