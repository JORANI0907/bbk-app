'use client'

/**
 * 운영 관리 대시보드 페이지 (admin 전용).
 * /admin (홈) 상단에 있던 심장박동/이달의숫자/임박항목 섹션을 이관.
 * 대표 의도 배너는 /admin 홈에 남겨두고 (worker 도 볼 수 있게) 이 페이지에서는 숨김.
 */

import { OpsDashboardSection } from '@/components/admin/ops/OpsDashboardSection'

export default function OpsDashboardPage() {
  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text-primary">운영 관리 대시보드</h1>
      </div>
      <OpsDashboardSection showIntent={false} />
    </div>
  )
}
