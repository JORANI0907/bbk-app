import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminSession, isDenied, apiOk, apiFail, errText } from '@/lib/admin-api'
import { DEFAULT_PRICING } from '@/lib/pricing/defaults'
import { SERVICE_TYPES, type PricingRuleRow } from '@/lib/pricing/types'

// GET /api/admin/pricing — 서비스 유형 4종의 현재 기준값. DB 에 없으면 기본값(id null)을 돌려준다.
export async function GET() {
  const auth = requireAdminSession({ allowWorker: true })
  if (isDenied(auth)) return auth

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('pricing_rules').select('*').eq('is_current', true)
    if (error) return apiFail(error.message, 500)

    const byType = new Map((data ?? []).map((r) => [r.service_type, r as PricingRuleRow]))
    const rules = SERVICE_TYPES.map((t) => byType.get(t) ?? {
      id: null, service_type: t, version_no: 0, config: DEFAULT_PRICING[t], is_current: true, note: '기본값(미저장)', created_by: null, created_at: null,
    })
    return apiOk(rules)
  } catch (e) {
    return apiFail(errText(e), 500)
  }
}
