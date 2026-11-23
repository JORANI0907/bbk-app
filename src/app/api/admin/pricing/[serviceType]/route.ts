import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminSession, isDenied, apiOk, apiFail, errText } from '@/lib/admin-api'
import { validatePricingConfig } from '@/lib/pricing/validate'
import { SERVICE_TYPES, type PricingServiceType } from '@/lib/pricing/types'

interface RouteParams { params: { serviceType: string } }

const isType = (t: string): t is PricingServiceType => (SERVICE_TYPES as string[]).includes(t)

// GET /api/admin/pricing/[serviceType] — 버전 이력 (최신순)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = requireAdminSession({ allowWorker: true })
  if (isDenied(auth)) return auth
  if (!isType(params.serviceType)) return apiFail('서비스 유형이 올바르지 않습니다.')

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('id, service_type, version_no, is_current, note, created_by, created_at, config')
      .eq('service_type', params.serviceType)
      .order('version_no', { ascending: false })
      .limit(30)
    if (error) return apiFail(error.message, 500)
    return apiOk(data ?? [])
  } catch (e) {
    return apiFail(errText(e), 500)
  }
}

// PUT /api/admin/pricing/[serviceType] — 새 버전 저장 (이전 버전은 이력으로 남김)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = requireAdminSession()
  if (isDenied(auth)) return auth
  if (!isType(params.serviceType)) return apiFail('서비스 유형이 올바르지 않습니다.')

  try {
    const body = (await request.json()) as { config?: unknown; note?: string }
    const checked = validatePricingConfig(body.config)
    if (!checked.ok) return apiFail(checked.errors.join(' / '))

    const supabase = createServiceClient()
    const { data: last } = await supabase
      .from('pricing_rules')
      .select('version_no')
      .eq('service_type', params.serviceType)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error: offErr } = await supabase
      .from('pricing_rules')
      .update({ is_current: false })
      .eq('service_type', params.serviceType)
      .eq('is_current', true)
    if (offErr) return apiFail(offErr.message, 500)

    const { data, error } = await supabase
      .from('pricing_rules')
      .insert({
        service_type: params.serviceType,
        version_no: (last?.version_no ?? 0) + 1,
        config: checked.config,
        is_current: true,
        note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
        created_by: auth.userId,
      })
      .select()
      .single()
    if (error) return apiFail(error.message, 500)
    return apiOk(data, 201)
  } catch (e) {
    return apiFail(errText(e), 500)
  }
}
