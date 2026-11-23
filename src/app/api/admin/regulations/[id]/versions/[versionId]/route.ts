import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isResponse, ok, fail, errorMessage } from '@/lib/regulations/server'

interface RouteParams { params: { id: string; versionId: string } }

// GET /api/admin/regulations/[id]/versions/[versionId] — 특정 버전 본문 (신구조문 대비·과거본 열람)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin({ allowWorker: true })
  if (isResponse(auth)) return auth

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('regulation_versions')
      .select('*')
      .eq('id', params.versionId)
      .eq('regulation_id', params.id)
      .single()
    if (error || !data) return fail('버전을 찾을 수 없습니다.', 404)
    return ok(data)
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}
