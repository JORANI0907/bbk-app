import { createServiceClient } from '@/lib/supabase/server'

export async function recordLoginLog(
  userId: string,
  role: string,
  success: boolean,
  ip: string,
  failureMsg?: string
): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('login_logs').insert({
      user_id: userId,
      role,
      success,
      ip_address: ip,
      failure_msg: failureMsg ?? null,
    })
  } catch {
    // 로그 실패는 메인 로직에 영향 없음
  }
}
