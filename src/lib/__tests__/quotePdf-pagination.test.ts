import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import { QuotePdfDocument, type QuotePdfData, type QuotePdfOnRender } from '../quotePdf'

/**
 * 견적서 항목이 많아 2페이지로 넘어갈 때, 1페이지를 먼저 채우고 넘친 항목만 2페이지로 가는지 확인.
 *
 * 2026-11-20 이전 버그: 항목 표가 1페이지 끝에 거의 딱 맞게 끝나면(예: 단가 숨김 + 긴 항목명 18줄)
 *   표의 marginBottom 까지는 안 들어간다는 이유로 react-pdf 가 표 전체를 2페이지로 밀어
 *   1페이지 아래가 통째로 비었다. 블록 간격을 '다음 블록의 marginTop' 으로 바꿔 해결.
 */

interface LayoutNode {
  type?: string
  value?: string
  lines?: unknown[]
  children?: LayoutNode[]
}

function textOf(node: LayoutNode): string {
  return (node.children ?? []).map(c => c.value ?? '').join('')
}

/** 실제로 글줄이 찍힌(lines 가 있는) 텍스트 노드의 내용만 모은다 — 페이지 경계에서 잘린 빈 조각은 제외 */
function collectRenderedTexts(node: LayoutNode, out: string[]): string[] {
  if (node.type === 'TEXT') {
    if ((node.lines?.length ?? 0) > 0) out.push(textOf(node))
    return out
  }
  for (const c of node.children ?? []) collectRenderedTexts(c, out)
  return out
}

const LONG_NAMES = [
  '패티케비넷 — 외부 기름기 청소 (2~3개)',
  '번스 토스터기 브러쉬 청소 — 철판 브러시로 부스러기 털어내기',
  '주방 바닥 청소 — 건식+습식 전체, 배수구 뜨거운물 20분 흘리기, 버거박스 3개 이동',
  '주방 내 모든 기물 설거지 — 야채통3·스텐원형통3·번토스터 부품2·후라이어 뚜껑3·가위·집게·얼음트레이·캐비닛3',
  '출입문 — 지문 청소',
]

function makeData(itemCount: number, opts: { longNames?: boolean; hideItemPrices?: boolean } = {}): QuotePdfData {
  const quoteItems = Array.from({ length: itemCount }, (_, i) => ({
    name: opts.longNames ? `${LONG_NAMES[i % LONG_NAMES.length]} #${i + 1}` : `항목 #${i + 1}`,
    qty: 1, unit_price: 10000, subtotal: 10000,
  }))
  return {
    quoteNo: 'Q-TEST-0001', createdAt: '2026-11-20', validUntil: '2026-12-20',
    ownerName: '홍길동', businessName: '테스트 매장', phone: '010-0000-0000', email: 'a@b.c', address: '경기도 성남시 어딘가 123-4 상가 1층', constructionDate: '2026-12-01',
    companyName: '범빌드코리아 (주)', companyCeo: '대표', companyBizNo: '398-81-04260', companyPhone: '1522-9597', companyAddress: '경기도 성남시 중원구',
    bankName: '국민은행', bankAccountNumber: '229137-04-013579', bankAccountHolder: '범빌드코리아 주식회사',
    quoteItems, supplyAmount: itemCount * 10000, vat: itemCount * 1000, totalAmount: itemCount * 11000,
    notes: '- 바닥 딥케어 + 유리창 청소 40만원(분기 1회)',
    hideItemPrices: opts.hideItemPrices ?? false,
  }
}

/** 페이지별로 항목 줄 수를 센다 (항목명은 '#번호' 로 끝난다) */
async function itemRowsPerPage(d: QuotePdfData): Promise<number[]> {
  let layout: LayoutNode | undefined
  const onRender: QuotePdfOnRender = (info) => {
    layout = (info as { _INTERNAL__LAYOUT__DATA_?: LayoutNode })._INTERNAL__LAYOUT__DATA_
  }
  await pdf(createElement(QuotePdfDocument, { d, onRender })).toBuffer()
  if (!layout) throw new Error('레이아웃 정보를 받지 못했습니다')
  return (layout.children ?? []).map(page => collectRenderedTexts(page, []).filter(t => /#\d+$/.test(t)).length)
}

describe('견적서 PDF 페이지 나눔', () => {
  it('항목이 적으면 1페이지', async () => {
    const pages = await itemRowsPerPage(makeData(8))
    expect(pages).toEqual([8])
  }, 30000)

  it('항목이 많으면 1페이지를 먼저 채우고 넘친 항목만 2페이지로', async () => {
    const pages = await itemRowsPerPage(makeData(45))
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages[0]).toBeGreaterThanOrEqual(15)
    expect(pages.reduce((a, b) => a + b, 0)).toBe(45)
  }, 30000)

  it('표가 1페이지 끝에 딱 맞게 끝나도 표 전체가 2페이지로 밀리지 않는다 (실제 사고 재현: 단가 숨김 + 긴 항목명)', async () => {
    // 항목 수를 바꿔 가며 '1페이지에 항목 0줄인데 2페이지에 전부' 인 경우가 없어야 한다
    for (let n = 12; n <= 26; n += 1) {
      const pages = await itemRowsPerPage(makeData(n, { longNames: true, hideItemPrices: true }))
      expect(pages[0], `항목 ${n}개: ${JSON.stringify(pages)}`).toBeGreaterThanOrEqual(Math.min(n, 12))
      expect(pages.reduce((a, b) => a + b, 0), `항목 ${n}개: ${JSON.stringify(pages)}`).toBe(n)
    }
  }, 120000)
})
