'use client'

import { useState } from 'react'
import { Archive } from 'lucide-react'
import { CustomersManagementView } from '@/components/admin/customers/CustomersManagementView'

type Segment = '정기엔드케어' | '정기딥케어' | '1회성케어'

/**
 * Phase 4-D: 고객DB이력 페이지
 * 3개 세그먼트(정기엔드/정기딥/1회성) 각각에 대해 CustomersManagementView를 archivedView 모드로 embed.
 * - 각 세그먼트는 archived_at IS NOT NULL 데이터만 표시
 * - 상세 편집 UI는 고객관리와 완전 동일
 * - 각 항목 선택 후 "고객관리로 되돌리기" 버튼으로 이관 취소 가능
 * - 1회성 세그먼트는 내부적으로 ServiceManagementView(archivedView) embed 됨
 */
export default function CustomerHistoryPage() {
  const [segment, setSegment] = useState<Segment>('정기엔드케어')

  const segButton = (v: Segment, label: string) => (
    <button
      onClick={() => setSegment(v)}
      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
        segment === v
          ? 'bg-brand-600 text-white border-brand-600'
          : 'bg-surface text-text-secondary border-border hover:border-brand-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="p-4 md:p-6 max-w-full space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Archive size={20} className="text-brand-500" />
        <h1 className="text-2xl font-bold text-text-primary leading-tight">고객DB이력</h1>
      </div>
      <p className="text-xs text-text-secondary break-keep">
        고객관리·서비스관리에서 이력으로 이관한 데이터입니다.
        각 항목을 선택해 "고객관리로 되돌리기"로 이관 취소 가능하며, 상세 편집은 원래와 동일하게 지원됩니다.
      </p>

      {/* 세그먼트 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {segButton('정기엔드케어', '정기엔드케어')}
        {segButton('정기딥케어', '정기딥케어')}
        {segButton('1회성케어', '1회성케어')}
      </div>

      {/* 본문 — 세그먼트 재렌더링을 위해 key 사용. wrapping 박스 제거로 검색창이 목록 박스 밖으로 나옴 */}
      <CustomersManagementView
        key={segment}
        forceCustomerType={segment}
        embedded
        archivedView
      />
    </div>
  )
}
