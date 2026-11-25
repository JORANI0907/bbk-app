/**
 * 계약서 서명 요청 발송 — 순수 함수 모음 (DB·네트워크 의존 없음, 단위 테스트 대상).
 *
 *   - 관리자가 발송 모달에서 확인·수정한 휴대폰 번호·이메일을 검증한다.
 *   - 이메일 본문을 만든다. 링크는 문자와 같은 서명 링크이고, 인증번호는 계약서에 등록된
 *     휴대폰으로만 가므로 본문에 그 번호 뒷자리를 안내한다.
 */
/**
 * 실제 발송 가능한 이메일인지. `@/lib/email` 의 isValidRealEmail 과 같은 규칙이지만,
 * 이 파일은 관리자 화면(클라이언트)에서도 쓰므로 nodemailer 를 끌어오지 않도록 따로 둔다.
 */
export function isRealEmail(email: string | null | undefined): email is string {
  if (!email) return false
  if (/@bbkorea\.(app|co\.kr|hq)$/i.test(email)) return false // 포털 로그인용 가상 이메일
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/** 숫자만 남긴 휴대폰 번호. 010/011/016/017/018/019 로 시작하는 10~11자리만 통과. */
export function normalizeMobile(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/\D/g, '')
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null
  return digits
}

/** 010-1234-5678 형태로 표시 */
export function formatMobile(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return digits
}

/** 010-****-5678 — 이메일 본문에 인증번호 수신 번호를 알려 줄 때 */
export function maskMobile(digits: string): string {
  const tail = digits.slice(-4)
  return `${digits.slice(0, 3)}-****-${tail}`
}

export interface SendTargetInput {
  phone: string | null | undefined
  email: string | null | undefined
}

export type SendTargetResult =
  | { ok: true; phone: string; email: string | null }
  | { ok: false; error: string }

/** 발송 대상 검증. 휴대폰은 필수, 이메일은 비우면 문자만 보낸다. */
export function resolveSendTarget(input: SendTargetInput): SendTargetResult {
  const phone = normalizeMobile(input.phone)
  if (!phone) return { ok: false, error: '휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)' }

  const rawEmail = (input.email ?? '').trim()
  if (!rawEmail) return { ok: true, phone, email: null }
  if (!isRealEmail(rawEmail)) {
    return { ok: false, error: '이메일 형식이 올바르지 않습니다. 비워 두면 문자만 발송됩니다.' }
  }
  return { ok: true, phone, email: rawEmail.toLowerCase() }
}

export interface SignEmailInput {
  businessName: string
  contactName: string | null
  signUrl: string
  /** 인증번호를 받을 휴대폰 (숫자만) */
  phone: string
  /** 링크 만료 시각 (ISO) */
  expiresAt: string
}

export interface SignEmailContent {
  subject: string
  html: string
  text: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 서명 요청 이메일 본문. 문자(CONTRACT_SEND)와 같은 링크를 보낸다. */
export function buildSignRequestEmail(input: SignEmailInput): SignEmailContent {
  const name = input.contactName?.trim() ? `${input.contactName.trim()} 님` : '담당자님'
  const biz = input.businessName.trim() || '고객사'
  const masked = maskMobile(input.phone)
  const expiry = formatExpiry(input.expiresAt)
  const subject = `[범빌드코리아] ${biz} 서비스 계약서 서명 요청`

  const text = [
    `${name}, 안녕하세요. 범빌드코리아입니다.`,
    '',
    `${biz}의 서비스 계약서가 준비되었습니다. 아래 링크에서 내용을 확인하시고 전자서명을 진행해 주세요.`,
    input.signUrl,
    '',
    `· 서명 시 본인 확인을 위해 등록된 휴대폰(${masked})으로 인증번호가 발송됩니다.`,
    expiry ? `· 링크는 ${expiry}까지 유효합니다.` : '· 링크는 발송일로부터 7일간 유효합니다.',
    '· 서명이 완료되면 같은 링크로 다시 서명할 수 없습니다.',
    '',
    '문의: 031-759-4877 / 010-5434-4877',
    '범빌드코리아 주식회사',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="ko">
<body style="font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;color:#1a1a1a;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>${escapeHtml(name)}, 안녕하세요.<br>범빌드코리아입니다.</p>
  <p><strong>${escapeHtml(biz)}</strong>의 서비스 계약서가 준비되었습니다.<br>아래 버튼을 눌러 내용을 확인하시고 전자서명을 진행해 주세요.</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.signUrl)}" style="display:inline-block;padding:12px 28px;background:#2AABE2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">계약서 확인하고 서명하기</a>
  </p>
  <p style="font-size:12px;color:#666;">버튼이 열리지 않으면 아래 주소를 복사해 브라우저에 붙여 넣어 주세요.<br><a href="${escapeHtml(input.signUrl)}" style="color:#2AABE2;word-break:break-all;">${escapeHtml(input.signUrl)}</a></p>
  <div style="background:#f3f6f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#333;margin:20px 0;">
    <p style="margin:4px 0;">· 서명 시 본인 확인을 위해 등록된 휴대폰(<strong>${escapeHtml(masked)}</strong>)으로 인증번호가 발송됩니다.</p>
    <p style="margin:4px 0;">${expiry ? `· 링크는 <strong>${escapeHtml(expiry)}</strong>까지 유효합니다.` : '· 링크는 발송일로부터 7일간 유효합니다.'}</p>
    <p style="margin:4px 0;">· 서명이 완료되면 같은 링크로 다시 서명할 수 없습니다.</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;margin:0;">문의: 031-759-4877 / 010-5434-4877<br>범빌드코리아 주식회사</p>
</body>
</html>`

  return { subject, html, text }
}

/** 발송 API 응답 안내 문구 — 관리자 화면 토스트에 그대로 쓴다 */
export function describeSendResult(r: { email: 'sent' | 'skipped' | 'failed'; emailError?: string | null }): string {
  if (r.email === 'sent') return '문자와 이메일로 서명 링크를 발송했습니다.'
  if (r.email === 'skipped') return '문자로 서명 링크를 발송했습니다. (이메일 없음)'
  return `문자는 발송했지만 이메일은 실패했습니다${r.emailError ? `: ${r.emailError}` : ''}`
}

/* ───────────── 완료된 계약서 발송 (문자 + 이메일 PDF 첨부) ───────────── */

export interface DeliveryEmailInput {
  businessName: string
  contactName: string | null
  /** 서명 완료 PDF 링크 (Storage signed URL) */
  pdfUrl: string
  /** 관리자 최종 확인 시각 (ISO) */
  completedAt: string | null
  /** PDF 파일을 첨부했는지 — 본문 안내 문구가 달라진다 */
  attached: boolean
}

/** 완료 계약서 안내 이메일 본문. 문자(CONTRACT_COMPLETE)와 같은 PDF 링크를 보낸다. */
export function buildContractDeliveryEmail(input: DeliveryEmailInput): SignEmailContent {
  const name = input.contactName?.trim() ? `${input.contactName.trim()} 님` : '담당자님'
  const biz = input.businessName.trim() || '고객사'
  const completed = input.completedAt ? formatExpiry(input.completedAt) : ''
  const subject = `[범빌드코리아] ${biz} 서비스 계약서 (서명 완료본)`
  const fileNote = input.attached ? '계약서 PDF를 첨부해 드립니다.' : '아래 링크에서 계약서 PDF를 내려받으실 수 있습니다.'

  const text = [
    `${name}, 안녕하세요. 범빌드코리아입니다.`,
    '',
    `${biz}의 서비스 계약서 서명이 모두 완료되었습니다. ${fileNote}`,
    input.pdfUrl,
    '',
    completed ? `· 최종 확인 일시: ${completed}` : null,
    '· 계약서는 보관해 두시고, 내용 문의는 아래 연락처로 주시면 됩니다.',
    '',
    '문의: 031-759-4877 / 010-5434-4877',
    '범빌드코리아 주식회사',
  ].filter((l): l is string => l !== null).join('\n')

  const html = `<!DOCTYPE html>
<html lang="ko">
<body style="font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;color:#1a1a1a;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>${escapeHtml(name)}, 안녕하세요.<br>범빌드코리아입니다.</p>
  <p><strong>${escapeHtml(biz)}</strong>의 서비스 계약서 서명이 모두 완료되었습니다.<br>${escapeHtml(fileNote)}</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.pdfUrl)}" style="display:inline-block;padding:12px 28px;background:#2AABE2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">계약서 PDF 열기</a>
  </p>
  <p style="font-size:12px;color:#666;">버튼이 열리지 않으면 아래 주소를 복사해 브라우저에 붙여 넣어 주세요.<br><a href="${escapeHtml(input.pdfUrl)}" style="color:#2AABE2;word-break:break-all;">${escapeHtml(input.pdfUrl)}</a></p>
  <div style="background:#f3f6f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#333;margin:20px 0;">
    ${completed ? `<p style="margin:4px 0;">· 최종 확인 일시: <strong>${escapeHtml(completed)}</strong></p>` : ''}
    <p style="margin:4px 0;">· 계약서는 보관해 두시고, 내용 문의는 아래 연락처로 주시면 됩니다.</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;margin:0;">문의: 031-759-4877 / 010-5434-4877<br>범빌드코리아 주식회사</p>
</body>
</html>`

  return { subject, html, text }
}

/** 이메일 첨부 파일명 — 업체명에서 파일명에 못 쓰는 글자를 뺀다 */
export function contractPdfFileName(businessName: string): string {
  const safe = businessName.replace(/[\/:*?"<>|]/g, '').trim() || '계약서'
  return `${safe}_서비스계약서.pdf`
}

/** 완료 계약서 발송 API 응답 안내 문구 */
export function describeDeliveryResult(r: { email: 'sent' | 'skipped' | 'failed'; emailError?: string | null }): string {
  if (r.email === 'sent') return '문자와 이메일로 계약서를 발송했습니다.'
  if (r.email === 'skipped') return '문자로 계약서 링크를 발송했습니다. (이메일 없음)'
  return `문자는 발송했지만 이메일은 실패했습니다${r.emailError ? `: ${r.emailError}` : ''}`
}
