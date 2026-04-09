import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await request.json()
  const { year, month, totals, channels } = body

  if (!totals) {
    return NextResponse.json({ error: '데이터가 필요합니다.' }, { status: 400 })
  }

  const channelSummary = Object.entries(channels as Record<string, { cpl: number; cac: number; conversion: number; roas: number; cost: number; contracts: number }>)
    .filter(([, m]) => m.cost > 0)
    .map(([ch, m]) =>
      `- ${ch}: 비용 ₩${m.cost.toLocaleString()}, 계약 ${m.contracts}건, CPL ₩${Math.round(m.cpl).toLocaleString()}, 전환율 ${m.conversion.toFixed(1)}%, ROAS ${m.roas.toFixed(0)}%`
    ).join('\n')

  const prompt = `당신은 BBK(범빌드코리아) 마케팅 전략 전문가입니다.
BBK는 서울/경기 지역 소상공인 대상 구독형 청소 서비스 회사입니다.
아래 ${year}년 ${month}월 마케팅 성과 데이터를 분석해 실용적인 월간 보고서를 작성해주세요.

## 이달의 주요 지표
- 총 마케팅 비용: ₩${totals.totalCost.toLocaleString()}
- 총 문의 건수: ${totals.totalInq}건
- 신규 계약: ${totals.totalContracts}건
- CAC (고객 획득 비용): ₩${Math.round(totals.cac).toLocaleString()} (목표: 20만원 이하)
- CPL (리드 비용): ₩${Math.round(totals.cpl).toLocaleString()} (목표: 3만원 이하)
- 전환율: ${totals.conversion.toFixed(1)}% (목표: 30% 이상)
- ROAS: ${totals.roas.toFixed(0)}% (목표: 500% 이상)
- MRR: ₩${totals.mrr.toLocaleString()} (목표: 375만원)
- LTV/CAC: ${totals.ltv_cac.toFixed(1)}x (목표: 5 이상)
- 회수 기간: ${totals.payback.toFixed(1)}개월 (목표: 2개월 이내)
- 구독 이탈율: ${totals.churn.toFixed(1)}% (목표: 10% 이하)

## 채널별 성과
${channelSummary}

## 보고서 형식 (아래 섹션 그대로 작성)

### 📊 이달의 핵심 성과 요약
(3~4줄로 이달 가장 중요한 성과와 특이사항)

### ✅ 잘된 점
(구체적 수치와 함께, 2~3개)

### ⚠️ 개선 필요
(구체적 수치와 함께, 2~3개)

### 🔍 채널별 효율 분석
(CPL과 전환율 기준으로 채널 순위 및 코멘트)

### 📋 다음 달 액션 아이템
1. (구체적 실행 항목)
2. (구체적 실행 항목)
3. (구체적 실행 항목)

### 💰 예산 배분 추천
(채널별 다음 달 예산 배분 추천, 합계 기준으로)

한국어로 작성하고, BBK 구독형 청소 비즈니스 맥락에서 실용적이고 실행 가능한 인사이트를 제공해주세요.`

  const message = await new Anthropic({ apiKey }).messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ report: text })
}
