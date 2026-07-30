/**
 * Phase 1 (운영 시스템) 수동 입력 검증 함수.
 * Zod 미도입 결정 (PLAN §0.4) → 필요한 규칙만 개별 함수로 구현.
 * 각 함수는 { ok: true, value } 또는 { ok: false, error: string, code?: string } 반환.
 */

export type Ok<T> = { ok: true; value: T }
export type Err = { ok: false; error: string; code?: string }
export type Result<T> = Ok<T> | Err

function ok<T>(value: T): Ok<T> { return { ok: true, value } }
function err(error: string, code?: string): Err { return { ok: false, error, code } }

// ─── daily_checks ────────────────────────────────────────────────
export function validateDailyCheckType(v: unknown): Result<'start' | 'end'> {
  if (v !== 'start' && v !== 'end') return err('type은 start 또는 end여야 합니다.', 'INVALID_TYPE')
  return ok(v)
}

export function validateDailyCheckNote(v: unknown): Result<string> {
  const s = typeof v === 'string' ? v.trim() : ''
  if (s.length > 500) return err('특이사항은 500자 이내로 입력해주세요.', 'NOTE_TOO_LONG')
  return ok(s || '특이사항 없음')
}

// ─── UUID 형식 (경량) ───────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateUuid(v: unknown, field: string): Result<string> {
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    return err(`${field}가 유효한 UUID 형식이 아닙니다.`, 'INVALID_UUID')
  }
  return ok(v)
}

// ─── photo_url (Supabase Storage public URL 형식만 허용) ─────
export function validatePhotoUrl(v: unknown): Result<string | null> {
  if (v == null || v === '') return ok(null)
  if (typeof v !== 'string') return err('photo_url은 문자열이어야 합니다.', 'INVALID_URL')
  if (!v.startsWith('https://')) return err('photo_url은 https URL이어야 합니다.', 'INVALID_URL')
  return ok(v)
}
