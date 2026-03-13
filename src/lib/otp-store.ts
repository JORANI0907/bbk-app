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
}

// 서버 싱글톤
const globalOTPStore = (globalThis as Record<string, unknown>) as { __bbkOTPStore?: OTPStore }
if (!globalOTPStore.__bbkOTPStore) {
  globalOTPStore.__bbkOTPStore = new OTPStore()
}

export const otpStore = globalOTPStore.__bbkOTPStore!
