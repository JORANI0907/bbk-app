import { describe, it, expect } from 'vitest'
import {
  buildSignRequestEmail, buildContractDeliveryEmail, contractPdfFileName, describeDeliveryResult, describeSendResult,
  formatMobile, isRealEmail, maskMobile, normalizeMobile, resolveSendTarget,
} from '@/lib/contract-send'

describe('normalizeMobile / formatMobile / maskMobile', () => {
  it('하이픈·공백을 지우고 숫자만 남긴다', () => {
    expect(normalizeMobile('010-4173-2010')).toBe('01041732010')
    expect(normalizeMobile(' 010 4173 2010 ')).toBe('01041732010')
    expect(normalizeMobile('011-234-5678')).toBe('0112345678')
  })

  it('휴대폰이 아니면 null', () => {
    expect(normalizeMobile('031-759-4877')).toBeNull()
    expect(normalizeMobile('0104173')).toBeNull()
    expect(normalizeMobile('')).toBeNull()
    expect(normalizeMobile(null)).toBeNull()
  })

  it('표시용·가림용 형식', () => {
    expect(formatMobile('01041732010')).toBe('010-4173-2010')
    expect(formatMobile('0112345678')).toBe('011-234-5678')
    expect(maskMobile('01041732010')).toBe('010-****-2010')
  })
})

describe('isRealEmail', () => {
  it('포털용 가상 이메일은 거른다', () => {
    expect(isRealEmail('abc@bbkorea.app')).toBe(false)
    expect(isRealEmail('staff@bbkorea.co.kr')).toBe(false)
    expect(isRealEmail('hq@bbkorea.hq')).toBe(false)
  })
  it('형식이 맞는 실제 이메일만 통과', () => {
    expect(isRealEmail('loof@pcpstandard.com')).toBe(true)
    expect(isRealEmail('loof@pcpstandard')).toBe(false)
    expect(isRealEmail('')).toBe(false)
    expect(isRealEmail(undefined)).toBe(false)
  })
})

describe('resolveSendTarget', () => {
  it('휴대폰은 필수, 이메일은 비우면 문자만', () => {
    expect(resolveSendTarget({ phone: '010-1111-2222', email: '' })).toEqual({ ok: true, phone: '01011112222', email: null })
    expect(resolveSendTarget({ phone: '010-1111-2222', email: '  ' })).toEqual({ ok: true, phone: '01011112222', email: null })
    expect(resolveSendTarget({ phone: '010-1111-2222', email: null })).toEqual({ ok: true, phone: '01011112222', email: null })
  })

  it('이메일은 소문자로 정리해 돌려준다', () => {
    expect(resolveSendTarget({ phone: '01011112222', email: ' Loof@PCPstandard.com ' }))
      .toEqual({ ok: true, phone: '01011112222', email: 'loof@pcpstandard.com' })
  })

  it('휴대폰 형식이 틀리면 거절', () => {
    const r = resolveSendTarget({ phone: '02-123-4567', email: 'a@b.co' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('휴대폰')
  })

  it('이메일 형식이 틀리면 거절 (비워 두라는 안내 포함)', () => {
    const r = resolveSendTarget({ phone: '01011112222', email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('비워 두면')
  })
})

describe('buildSignRequestEmail', () => {
  const mail = buildSignRequestEmail({
    businessName: '영도교회', contactName: '차은직',
    signUrl: 'https://app.bbkorea.co.kr/sign/abc-123',
    phone: '01041732010', expiresAt: '2026-12-02T09:00:00.000Z',
  })

  it('제목에 업체명, 본문에 링크·가린 번호·만료일이 들어간다', () => {
    expect(mail.subject).toBe('[범빌드코리아] 영도교회 서비스 계약서 서명 요청')
    expect(mail.html).toContain('https://app.bbkorea.co.kr/sign/abc-123')
    expect(mail.text).toContain('https://app.bbkorea.co.kr/sign/abc-123')
    expect(mail.html).toContain('010-****-2010')
    expect(mail.html).not.toContain('01041732010')
    expect(mail.text).toContain('2026년 12월 2일')
    expect(mail.text).toContain('다시 서명할 수 없습니다')
  })

  it('담당자 이름이 없으면 "담당자님"', () => {
    const m = buildSignRequestEmail({ businessName: '테스트', contactName: null, signUrl: 'https://x/sign/t', phone: '01000000000', expiresAt: 'bad-date' })
    expect(m.text.startsWith('담당자님,')).toBe(true)
    expect(m.text).toContain('7일간 유효')
  })

  it('HTML 특수문자는 이스케이프한다', () => {
    const m = buildSignRequestEmail({ businessName: '<b>해킹</b>', contactName: null, signUrl: 'https://x/sign/t', phone: '01000000000', expiresAt: '' })
    expect(m.html).toContain('&lt;b&gt;해킹&lt;/b&gt;')
    expect(m.html).not.toContain('<b>해킹</b>')
  })
})

describe('describeSendResult', () => {
  it('결과별 안내 문구', () => {
    expect(describeSendResult({ email: 'sent' })).toContain('문자와 이메일')
    expect(describeSendResult({ email: 'skipped' })).toContain('이메일 없음')
    expect(describeSendResult({ email: 'failed', emailError: 'SMTP 오류' })).toContain('SMTP 오류')
  })
})

describe('buildContractDeliveryEmail / contractPdfFileName / describeDeliveryResult', () => {
  const base = { businessName: '루프제기031', contactName: '김세윤', pdfUrl: 'https://x.test/signed.pdf', completedAt: '2026-11-25T09:00:00.000Z' }

  it('첨부했을 때와 링크만 보낼 때 안내 문구가 다르다', () => {
    const a = buildContractDeliveryEmail({ ...base, attached: true })
    const b = buildContractDeliveryEmail({ ...base, attached: false })
    expect(a.subject).toBe('[범빌드코리아] 루프제기031 서비스 계약서 (서명 완료본)')
    expect(a.text).toContain('PDF를 첨부해')
    expect(b.text).toContain('내려받으실 수')
    expect(a.html).toContain('https://x.test/signed.pdf')
    expect(a.text).toContain('김세윤 님')
  })

  it('최종 확인 일시는 KST 로, 없으면 줄 자체를 뺀다', () => {
    const a = buildContractDeliveryEmail({ ...base, attached: true })
    expect(a.text).toMatch(/최종 확인 일시: 2026년 11월 25일 .*06:00/)
    const b = buildContractDeliveryEmail({ ...base, completedAt: null, attached: true })
    expect(b.text).not.toContain('최종 확인 일시')
    expect(b.html).not.toContain('최종 확인 일시')
  })

  it('담당자 이름이 없으면 담당자님, HTML 은 이스케이프', () => {
    const r = buildContractDeliveryEmail({ ...base, businessName: 'A&B <상사>', contactName: '  ', attached: true })
    expect(r.text).toContain('담당자님')
    expect(r.html).toContain('A&amp;B &lt;상사&gt;')
  })

  it('첨부 파일명은 업체명 기반, 금지 문자 제거', () => {
    expect(contractPdfFileName('루프제기031')).toBe('루프제기031_서비스계약서.pdf')
    expect(contractPdfFileName('A/B:C*?')).toBe('ABC_서비스계약서.pdf')
    expect(contractPdfFileName('   ')).toBe('계약서_서비스계약서.pdf')
  })

  it('발송 결과 문구', () => {
    expect(describeDeliveryResult({ email: 'sent' })).toContain('문자와 이메일로 계약서')
    expect(describeDeliveryResult({ email: 'skipped' })).toContain('이메일 없음')
    expect(describeDeliveryResult({ email: 'failed', emailError: 'boom' })).toContain('boom')
  })
})
