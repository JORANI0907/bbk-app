// ─── Types ────────────────────────────────────────────────────────────────────

export type ChannelData = { cost: number; inquiries: number; contracts: number; avgFee: number }
export type MonthData = { channels: Record<string, ChannelData>; subscribers: number; churnCount: number; mrr: number }
export type AllData = Record<string, MonthData>

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHANNELS = ['숨고', '네이버 블로그', '네이버 검색광고', '인스타그램', '카카오톡']

export const GOALS: Record<string, { target: number; dir: 'lower' | 'higher'; unit: string; label: string }> = {
  cac:        { target: 200000,  dir: 'lower',  unit: 'won', label: '20만원 이하' },
  ltv_cac:    { target: 5,       dir: 'higher', unit: 'x',   label: '5 이상' },
  roas:       { target: 500,     dir: 'higher', unit: '%',   label: '500% 이상' },
  cpl:        { target: 30000,   dir: 'lower',  unit: 'won', label: '3만원 이하' },
  conversion: { target: 30,      dir: 'higher', unit: '%',   label: '30% 이상' },
  mrr:        { target: 3750000, dir: 'higher', unit: 'won', label: '375만원' },
  churn:      { target: 10,      dir: 'lower',  unit: '%',   label: '10% 이하' },
  payback:    { target: 2,       dir: 'lower',  unit: '개월', label: '2개월 이내' },
}

export const TIPS: Record<string, string> = {
  cac:        '고객 1명 획득 비용\n공식: 총 마케팅 비용 ÷ 신규 계약 수\n예시: 광고비 30만원 → 신규 2건 = CAC 15만원\n낮을수록 좋음',
  ltv_cac:    '마케팅 수익성 비율\n공식: LTV ÷ CAC\n1미만: 손해 / 1~3: 보통 / 3이상: 우수 / 5이상: 매우 우수\n예시: LTV 118.8만 ÷ CAC 15만 = 7.9',
  roas:       '광고비 대비 매출\n공식: 광고 발생 매출 ÷ 광고비 × 100%\n예시: 광고비 50만 → LTV 매출 356만 = 713%\n300% 이상 우수, 500% 이상 목표',
  cpl:        '리드 1건당 비용\n공식: 총 마케팅 비용 ÷ 문의 건수\n예시: 숨고 20만원 → 문의 10건 = CPL 2만원\n채널별 비교 필수',
  conversion: '문의 → 계약 성사율\n공식: 계약 건수 ÷ 문의 건수 × 100%\n예시: 문의 10건 중 3건 계약 = 30%\n전환율 높은 채널이 진짜 효율적',
  mrr:        '월 고정 반복 매출\n공식: 구독 고객 수 × 평균 월 계약금\n예시: 8개 업체 × 15만원 = 120만원\n목표: 25개 업체 → 375만원',
  churn:      '구독 이탈율\n공식: 해지 건수 ÷ 전체 구독자 × 100%\n예시: 8개 중 1개 해지 = 12.5%\n높으면 신규 확보 의미 없음',
  payback:    'CAC 회수 개월 수\n공식: CAC ÷ 월 계약금\n예시: CAC 15만 ÷ 월 9.9만 = 1.5개월\n2개월 이내면 현금흐름 안정',
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

export const SAMPLE_DATA: AllData = {
  '2026-1': {
    channels: {
      '숨고':            { cost: 150000, inquiries: 7, contracts: 1, avgFee: 124000 },
      '네이버 블로그':   { cost: 230000, inquiries: 6, contracts: 1, avgFee:  99000 },
      '네이버 검색광고': { cost: 300000, inquiries: 4, contracts: 1, avgFee: 124000 },
      '인스타그램':      { cost:  80000, inquiries: 2, contracts: 1, avgFee:  99000 },
      '카카오톡':        { cost:  40000, inquiries: 1, contracts: 0, avgFee:  99000 },
    },
    subscribers: 5, churnCount: 0, mrr: 750000,
  },
  '2026-2': {
    channels: {
      '숨고':            { cost: 175000, inquiries: 9, contracts: 2, avgFee: 124000 },
      '네이버 블로그':   { cost: 265000, inquiries: 7, contracts: 1, avgFee:  99000 },
      '네이버 검색광고': { cost: 350000, inquiries: 5, contracts: 1, avgFee: 124000 },
      '인스타그램':      { cost:  90000, inquiries: 3, contracts: 1, avgFee:  99000 },
      '카카오톡':        { cost:  20000, inquiries: 1, contracts: 0, avgFee:  99000 },
    },
    subscribers: 6, churnCount: 0, mrr: 900000,
  },
  '2026-3': {
    channels: {
      '숨고':            { cost: 200000, inquiries: 10, contracts: 3, avgFee: 124000 },
      '네이버 블로그':   { cost: 300000, inquiries:  8, contracts: 3, avgFee:  99000 },
      '네이버 검색광고': { cost: 400000, inquiries:  6, contracts: 2, avgFee: 124000 },
      '인스타그램':      { cost: 100000, inquiries:  3, contracts: 1, avgFee:  99000 },
      '카카오톡':        { cost:  50000, inquiries:  5, contracts: 2, avgFee:  99000 },
    },
    subscribers: 8, churnCount: 1, mrr: 1200000,
  },
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export const won = (n: number) => n > 0 ? `₩${Math.round(n).toLocaleString()}` : '-'
export const pct = (n: number) => n > 0 ? `${n.toFixed(1)}%` : '-'

export function defaultMonthData(): MonthData {
  return {
    channels: Object.fromEntries(
      CHANNELS.map(c => [c, { cost: 0, inquiries: 0, contracts: 0, avgFee: 99000 }])
    ),
    subscribers: 0,
    churnCount: 0,
    mrr: 0,
  }
}

export function calcChannel(ch: ChannelData) {
  const cpl = ch.inquiries > 0 ? ch.cost / ch.inquiries : 0
  const cac = ch.contracts > 0 ? ch.cost / ch.contracts : 0
  const conversion = ch.inquiries > 0 ? (ch.contracts / ch.inquiries) * 100 : 0
  const roas = ch.cost > 0 ? (ch.contracts * ch.avgFee * 12 / ch.cost) * 100 : 0
  return { cpl, cac, conversion, roas }
}

export function calcTotals(d: MonthData) {
  const chs = Object.values(d.channels)
  const totalCost = chs.reduce((s, c) => s + c.cost, 0)
  const totalInq = chs.reduce((s, c) => s + c.inquiries, 0)
  const totalContracts = chs.reduce((s, c) => s + c.contracts, 0)
  const avgFee = totalContracts > 0
    ? chs.reduce((s, c) => s + c.contracts * c.avgFee, 0) / totalContracts
    : 99000
  const cpl = totalInq > 0 ? totalCost / totalInq : 0
  const cac = totalContracts > 0 ? totalCost / totalContracts : 0
  const conversion = totalInq > 0 ? (totalContracts / totalInq) * 100 : 0
  const roas = totalCost > 0 ? (totalContracts * avgFee * 12 / totalCost) * 100 : 0
  const ltv12 = avgFee * 12
  const ltv_cac = cac > 0 ? ltv12 / cac : 0
  const payback = avgFee > 0 ? cac / avgFee : 0
  const churn = d.subscribers > 0 ? (d.churnCount / d.subscribers) * 100 : 0
  return { totalCost, totalInq, totalContracts, avgFee, cpl, cac, conversion, roas, ltv12, ltv_cac, payback, churn, mrr: d.mrr }
}

export function achievementRate(value: number, key: string) {
  const g = GOALS[key]
  if (!g || value === 0) return 0
  if (g.dir === 'higher') return Math.min((value / g.target) * 100, 200)
  return value <= g.target ? 100 : Math.max(0, (g.target / value) * 100)
}

export function rateColors(rate: number) {
  if (rate >= 100) return { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', bar: 'bg-emerald-500' }
  if (rate >= 70)  return { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-600',   bar: 'bg-amber-500' }
  return               { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-600',    bar: 'bg-red-500' }
}
