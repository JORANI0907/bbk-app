import { describe, it, expect } from 'vitest'
import {
  applyRegulationVars, buildReferenceTable, buildRegulationAppendixHtml, collectRequiredCodes,
  extractArticleHtml, findMissingAgreements, findRegulationCodes, formatRegulationLabel, formatRegulationTitle,
  hasRegulationVars, normalizeKeyClauses, stripRegulationCodes, type RegulationDocSnapshot,
} from '../contract-regulation-vars'

const CP03_HTML =
  '<h2>제3장 정기 서비스의 해약</h2>' +
  '<p><strong>제8조 (해약 통지)</strong></p><p>① 서면으로 통지합니다.</p>' +
  '<p><strong>제9조 (해약 시 정산)</strong></p><p>① 차등 적용 단가로 다시 계산합니다.</p><p>1. 0~6개월: 정상가</p>' +
  '<table><tbody><tr><td><p>표</p></td></tr></tbody></table>' +
  '<p><strong>제10조 (청약철회)</strong></p><p>① 7일 이내 {{시행일}}</p>'

const cp03: RegulationDocSnapshot = {
  code: 'CP-03', title: '예약 취소·변경 및 환불 정책', version_id: 'v-3', version_no: 1,
  status: 'published', effective_date: '2026-12-01', html: CP03_HTML,
}
const cp01: RegulationDocSnapshot = {
  code: 'CP-01', title: '서비스 이용약관', version_id: 'v-1', version_no: 2,
  status: 'draft', effective_date: null, html: '<p><strong>제1조 (목적)</strong></p><p>내용</p>',
}

describe('변수 탐지', () => {
  it('규정 변수 4종을 인식한다', () => {
    expect(hasRegulationVars('a {{규정:CP-03:9}} b')).toBe(true)
    expect(hasRegulationVars('{{ 규정버전:CP-01 }}')).toBe(true)
    expect(hasRegulationVars('{{준거문서표}}')).toBe(true)
    expect(hasRegulationVars('{{서비스유형}}')).toBe(true)
    expect(hasRegulationVars('{{고객서명}} {{오늘날짜}}')).toBe(false)
  })

  it('본문이 가리키는 규정 코드를 중복 없이 모은다', () => {
    const html = '{{규정:CP-03:9}} {{규정버전:CP-03}} {{규정버전:CP-05}}'
    expect(findRegulationCodes(html)).toEqual(['CP-03', 'CP-05'])
  })

  it('필수 목록 + 본문 변수 + (공동계약 시) 선택 목록 순으로 합친다', () => {
    const config = { regulation_refs: ['CP-01', 'CP-03'], optional_refs: [{ code: 'CP-04', when: 'joint_contract' }] }
    expect(collectRequiredCodes('{{규정버전:CP-05}}', config)).toEqual(['CP-01', 'CP-03', 'CP-05'])
    expect(collectRequiredCodes('{{규정버전:CP-05}}', config, { jointContract: true })).toEqual(['CP-01', 'CP-03', 'CP-04', 'CP-05'])
    expect(collectRequiredCodes('없음', null)).toEqual([])
  })
})

describe('조문 추출과 라벨', () => {
  it('제N조 블록을 다음 조 직전까지 잘라 오고 시행일을 채운다', () => {
    const art = extractArticleHtml(CP03_HTML, '9', '2026-12-01')
    expect(art).toContain('제9조 (해약 시 정산)')
    expect(art).toContain('<table>')
    expect(art).not.toContain('제10조')
    expect(extractArticleHtml(CP03_HTML, '10', '2026-12-01')).toContain('2026년 12월 1일')
  })

  it('없는 조는 null', () => {
    expect(extractArticleHtml(CP03_HTML, '99', null)).toBeNull()
  })

  it('관리자 라벨은 코드 포함, 고객 라벨은 제목만', () => {
    expect(formatRegulationLabel(cp03)).toBe('CP-03 예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)')
    expect(formatRegulationLabel(cp01)).toBe('CP-01 서비스 이용약관 (초안 제2판)')
    expect(formatRegulationTitle(cp03)).toBe('예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)')
  })

  it('고객용 본문에서 내부 코드를 지운다 (한글 제목 앞의 코드만)', () => {
    expect(stripRegulationCodes('「CP-03 예약 취소·변경 및 환불 정책」에 따릅니다')).toBe('「예약 취소·변경 및 환불 정책」에 따릅니다')
    expect(stripRegulationCodes('문서 코드(예: CP-03)로 가리킨다')).toBe('문서 코드로 가리킨다')
    expect(stripRegulationCodes('OP-08 결제 방법 안내는 폐지')).toBe('결제 방법 안내는 폐지')
    expect(stripRegulationCodes('모델명 CP-03X 는 그대로')).toBe('모델명 CP-03X 는 그대로')
  })
})

describe('applyRegulationVars', () => {
  const html = '<h1>{{서비스유형}} 계약서</h1><p>② {{규정버전:CP-03}}</p>{{규정:CP-03:9}}<p>표</p>{{준거문서표}}'

  it('네 변수를 모두 채우고 조문은 인용문으로 감싼다', () => {
    const r = applyRegulationVars({ html, docs: [cp01, cp03], serviceType: '정기딥케어' })
    expect(r.unresolved).toEqual([])
    expect(r.html).toContain('<h1>정기딥케어 계약서</h1>')
    expect(r.html).toContain('예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)')
    expect(r.html).not.toContain('CP-03 예약')
    expect(r.html).toContain('<blockquote>')
    expect(r.html).toContain('제9조 (해약 시 정산)')
    expect(r.html).toContain('서명 화면에서 열람')
    expect(r.html).not.toContain('{{')
  })

  it('서비스 유형이 없으면 "정기 서비스"', () => {
    const r = applyRegulationVars({ html: '{{서비스유형}}', docs: [] })
    expect(r.html).toBe('정기 서비스')
  })

  it('규정이 없거나 조가 없으면 원문을 남기고 unresolved 에 모은다', () => {
    const r = applyRegulationVars({ html: '{{규정:CP-03:99}} {{규정버전:CP-09}}', docs: [cp03] })
    expect(r.unresolved).toEqual(['{{규정:CP-03:99}}', '{{규정버전:CP-09}}'])
    expect(r.html).toContain('{{규정:CP-03:99}}')
  })

  it('준거문서표는 문서마다 한 줄, 초안은 "초안" 표기', () => {
    const t = buildReferenceTable([cp01, cp03])
    expect((t.match(/<tr>/g) ?? []).length).toBe(3)
    expect(t).toContain('초안 제2판')
    expect(t).toContain('2026년 12월 1일 시행')
  })
})

describe('확인 항목', () => {
  it('빈 값·중복 key 를 걸러 정리한다', () => {
    const out = normalizeKeyClauses([
      { key: 'a', label: '가' }, { key: 'a', label: '중복' }, { key: '', label: '빈키' }, { key: 'b', label: '' }, null, { key: 'c', label: ' 다 ' },
    ])
    expect(out).toEqual([{ key: 'a', label: '가' }, { key: 'c', label: '다' }])
  })

  it('빠진 항목만 돌려준다', () => {
    const req = [{ key: 'a', label: '가' }, { key: 'b', label: '나' }]
    expect(findMissingAgreements(req, ['a'])).toEqual(['b'])
    expect(findMissingAgreements(req, ['a', 'b', 'x'])).toEqual([])
    expect(findMissingAgreements([], [])).toEqual([])
  })
})

describe('별첨', () => {
  it('문서마다 새 페이지로 시작하고 라벨을 붙인다', () => {
    const a = buildRegulationAppendixHtml([cp01, cp03])
    expect((a.match(/page-break-before:always/g) ?? []).length).toBe(2)
    expect(a).toContain('별첨 1. 서비스 이용약관')
    expect(a).toContain('별첨 2. 예약 취소·변경 및 환불 정책')
    expect(a).toContain('BBK_BLOCK_START:regulation-appendix')
    expect(buildRegulationAppendixHtml([])).toBe('')
  })
})
