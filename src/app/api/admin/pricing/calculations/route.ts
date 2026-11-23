import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminSession, isDenied, apiOk, apiFail, errText } from '@/lib/admin-api'
import { SERVICE_TYPES } from '@/lib/pricing/types'

// GET /api/admin/pricing/calculations — 최근 계산 20건
export async function GET() {
  const auth = requireAdminSession({ allowWorker: true })
  if (isDenied(auth)) return auth
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('pricing_calculations')
      .select('id, service_type, rule_id, inputs, result, label, application_id, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return apiFail(error.message, 500)
    return apiOk(data ?? [])
  } catch (e) {
    return apiFail(errText(e), 500)
  }
}

// POST /api/admin/pricing/calculations — 계산 결과 저장 (입력·결과·사용 기준 버전)
export async function POST(request: NextRequest) {
  const auth = requireAdminSession({ allowWorker: true })
  if (isDenied(auth)) return auth
  try {
    const body = (await request.json()) as Record<string, unknown>
    const serviceType = String(body.service_type ?? '')
    if (!(SERVICE_TYPES as string[]).includes(serviceType)) return apiFail('서비스 유형이 올바르지 않습니다.')
    if (!body.inputs || !body.result) return apiFail('입력과 결과가 필요합니다.')

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('pricing_calculations')
      .insert({
        service_type: serviceType,
        rule_id: typeof body.rule_id === 'string' ? body.rule_id : null,
        inputs: body.inputs,
        result: body.result,
        label: typeof body.label === 'string' ? body.label.slice(0, 120) : null,
        application_id: typeof body.application_id === 'string' ? body.application_id : null,
        created_by: auth.userId,
      })
      .select('id')
      .single()
    if (error) return apiFail(error.message, 500)
    return apiOk(data, 201)
  } catch (e) {
    return apiFail(errText(e), 500)
  }
}
