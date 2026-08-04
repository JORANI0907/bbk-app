import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { EDITOR_VARIABLES } from '@/lib/contractTemplate'

/**
 * GET — 편집기 변수 삽입 패널에 노출할 변수 목록.
 *
 * v2: 하드코딩된 7종만 반환 (인적사항표 + 오늘날짜 + 서명·직인 5종).
 * 옛 contract_variables 테이블은 더 이상 조회하지 않는다.
 * 옛 계약서 인스턴스는 이미 렌더된 스냅샷이 저장돼 있어 영향 없음.
 */
export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }

  const data = EDITOR_VARIABLES.map((v, i) => ({
    id: String(i + 1),
    name: v.name,
    label: v.label,
    // 편집기 뱃지 색상용 — 표 마커/시스템/서명 모두 auto 로 표기
    mode: 'auto' as const,
  }))

  return NextResponse.json({ success: true, data })
}
