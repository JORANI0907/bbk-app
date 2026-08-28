/**
 * OTP 인메모리 저장소 (서버 싱글톤)
 * 실운영에서는 Redis로 교체 권장
 */
import crypto from 'crypto'

interface OTPEntry {
  hashedOTP: string
  expiresAt: number
  attempts: number
}

class OTPStore {
  private store = new Map<string, OTPEntry>()
  private locks = new Map<string, number>()
  private rateLimits = new Map<string, number>()
  // 인증 통과 후 유효 상태 유지 (예: 클레임 접수 페이지에서 OTP 통과 후 상세 입력 30분 여유).
  // 재사용은 소비되면 삭제.
  private verified = new Map<string, number>() // phone → expiresAt(ms)
  private static VERIFIED_TTL_MS = 30 * 60 * 1000 // 30분

  private hash(otp: string, phone: string): string {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'bbk-secret-key'
    return crypto.createHmac('sha256', secret)
      .update(`${otp}:${phone}`)
      .digest('hex')
  }

  isRateLimited(phone: string): number {
    const last = this.rateLimits.get(phone)
    if (!last) return 0
    const remaining = 60000 - (Date.now() - last)
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }

  isLocked(phone: string): number {
    const until = this.locks.get(phone)
    if (!until || Date.now() >= until) return 0
    return Math.ceil((until - Date.now()) / 60000)
  }

  save(phone: string, otp: string): void {
    this.store.set(phone, {
      hashedOTP: this.hash(otp, phone),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    })
    this.rateLimits.set(phone, Date.now())
  }

  verify(phone: string, otp: string): { success: boolean; error?: string } {
    const entry = this.store.get(phone)
    if (!entry) return { success: false, error: '인증번호를 먼저 요청해주세요.' }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(phone)
      return { success: false, error: '인증번호가 만료되었습니다. 다시 요청해주세요.' }
    }

    const hashed = this.hash(otp, phone)
    if (hashed !== entry.hashedOTP) {
      entry.attempts += 1
      if (entry.attempts >= 5) {
        this.store.delete(phone)
        this.locks.set(phone, Date.now() + 15 * 60 * 1000)
        return { success: false, error: '인증 실패 5회 초과. 15분 후 재시도하세요.' }
      }
      return { success: false, error: `인증번호가 올바르지 않습니다. (${5 - entry.attempts}회 남음)` }
    }

    this.store.delete(phone)
    return { success: true }
  }

  /**
   * 인증 통과 후 phone 을 verified 상태로 마킹.
   * TTL 30분 안에 consumeVerified() 로 소비 가능.
   * 접수 플로우에서 OTP 확인 단계와 최종 접수 단계를 분리할 때 사용.
   */
  markVerified(phone: string): void {
    this.verified.set(phone, Date.now() + OTPStore.VERIFIED_TTL_MS)
  }

  /**
   * verified 상태 소비 (성공 시 삭제 · 일회용).
   * 남은 유효시간(초) 이 필요하면 별도 조회.
   */
  consumeVerified(phone: string): boolean {
    const until = this.verified.get(phone)
    if (!until) return false
    if (Date.now() > until) {
      this.verified.delete(phone)
      return false
    }
    this.verified.delete(phone)
    return true
  }

  /**
   * 소비 없이 verified 상태만 확인 (남은 초 반환. 0 이면 없음).
   */
  peekVerified(phone: string): number {
    const until = this.verified.get(phone)
    if (!until) return 0
    const remaining = until - Date.now()
    if (remaining <= 0) {
      this.verified.delete(phone)
      return 0
    }
    return Math.floor(remaining / 1000)
  }
}

// 서버 싱글톤
const globalOTPStore = (globalThis as Record<string, unknown>) as { __bbkOTPStore?: OTPStore }
if (!globalOTPStore.__bbkOTPStore) {
  globalOTPStore.__bbkOTPStore = new OTPStore()
}

export const otpStore = globalOTPStore.__bbkOTPStore!
