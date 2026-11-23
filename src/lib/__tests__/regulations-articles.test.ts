import { describe, it, expect } from 'vitest'
import {
  parseArticles,
  buildToc,
  renderRegulationHtml,
  diffArticles,
  validateArticleNumbers,
  formatKoreanDate,
} from '@/lib/regulations/articles'

const SAMPLE =
  '<p>서문입니다.</p>' +
  '<h2>제1장 총칙</h2>' +
  '<p><strong>제1조 (목적)</strong></p><p>① 이 규정은 목적을 정한다.</p>' +
  '<p><strong>제2조 (적용 범위)</strong></p><p>모든 작업자에게 적용한다.</p><p>1. 프리랜서</p>' +
  '<h2>제2장 운영</h2>' +
  '<p><strong>제3조 (배정)</strong></p><p>① 회사는 배정을 제안한다.</p>' +
  '<p><strong>제3조의2 (거절)</strong></p><p>작업자는 거절할 수 있다.</p>' +
  '<h2>부칙</h2><p>① 이 규정은 {{시행일}}부터 시행한다.</p>'

describe('parseArticles', () => {
  it('장·조·가지번호를 파싱하고 조 본문을 묶는다', () => {
    const arts = parseArticles(SAMPLE)
    expect(arts.map((a) => a.number)).toEqual(['제1조', '제2조', '제3조', '제3조의2'])
    expect(arts[0].chapter).toBe('제1장 총칙')
    expect(arts[2].chapter).toBe('제2장 운영')
    expect(arts[1].title).toBe('적용 범위')
    expect(arts[1].text).toContain('1. 프리랜서')
    expect(arts[3].id).toBe('art-3-2')
  })

  it('서문은 조에 포함하지 않는다', () => {
    const arts = parseArticles(SAMPLE)
    expect(arts.some((a) => a.text.includes('서문'))).toBe(false)
  })
})

describe('buildToc', () => {
  it('장별로 조를 묶는다', () => {
    const toc = buildToc(SAMPLE)
    expect(toc.map((c) => c.title)).toEqual(['제1장 총칙', '제2장 운영'])
    expect(toc[1].articles.map((a) => a.number)).toEqual(['제3조', '제3조의2'])
  })
})

describe('renderRegulationHtml', () => {
  it('조 제목에 앵커 id 를 붙이고 시행일을 치환한다', () => {
    const html = renderRegulationHtml(SAMPLE, '2026-12-01')
    expect(html).toContain('<p id="art-1">')
    expect(html).toContain('<p id="art-3-2">')
    expect(html).toContain('2026년 12월 1일부터 시행한다')
    expect(html).not.toContain('{{시행일}}')
  })

  it('시행일이 없으면 미정으로 표시한다', () => {
    expect(renderRegulationHtml('<p>{{시행일}}</p>', null)).toBe('<p>(시행일 미정)</p>')
  })
})

describe('diffArticles', () => {
  const next = SAMPLE
    .replace('① 회사는 배정을 제안한다.', '① 회사는 앱으로 배정을 제안한다.')
    .replace('<p><strong>제3조의2 (거절)</strong></p><p>작업자는 거절할 수 있다.</p>', '')
    + '<p><strong>제4조 (보수)</strong></p><p>건별로 정산한다.</p>'

  it('변경·삭제·추가 조문을 번호순으로 돌려준다', () => {
    const changes = diffArticles(SAMPLE, next)
    expect(changes.map((c) => [c.kind, c.number])).toEqual([
      ['changed', '제3조'],
      ['removed', '제3조의2'],
      ['added', '제4조'],
    ])
    expect(changes[0].before?.text).toContain('배정을 제안')
    expect(changes[0].after?.text).toContain('앱으로 배정')
  })

  it('동일 본문이면 변경이 없다', () => {
    expect(diffArticles(SAMPLE, SAMPLE)).toEqual([])
  })
})

describe('validateArticleNumbers', () => {
  it('빠진 번호와 중복 번호를 찾는다', () => {
    const html =
      '<p><strong>제1조 (가)</strong></p><p>a</p>' +
      '<p><strong>제3조 (나)</strong></p><p>b</p>' +
      '<p><strong>제3조 (다)</strong></p><p>c</p>'
    expect(validateArticleNumbers(html)).toEqual({ missing: [2], duplicated: ['art-3'] })
  })

  it('정상이면 비어 있다', () => {
    expect(validateArticleNumbers(SAMPLE)).toEqual({ missing: [], duplicated: [] })
  })
})

describe('formatKoreanDate', () => {
  it('YYYY-MM-DD 를 한국어 날짜로 바꾼다', () => {
    expect(formatKoreanDate('2027-01-05')).toBe('2027년 1월 5일')
    expect(formatKoreanDate(null)).toBe('')
  })
})
