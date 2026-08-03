'use client'

import { Archive } from 'lucide-react'
import { CustomersManagementView } from '@/components/admin/customers/CustomersManagementView'

/**
 * Phase 4-D → 리팩터: 고객DB이력 페이지
 * - 이전: 세그먼트(정기엔드/정기딥/1회성) 3개 중 택1 + 매 전환마다 remount
 * - 변경: 3개 유형 모두 기본 선택 상태로 CustomersManagementView 1회 마운트.
 *   유형 필터 pill은 CustomersManagementView 내부 UI로 복수 선택·해제 가능.
 *   뷰 모드 기본은 리스트(내부에서 archivedView=true 감지), 캘린더 토글 유지.
 *   초기 30건만 노출 + "더보기" 버튼 (내부 페이지네이션).
 *   검색은 DB 모든 필드 대상 (검색 시 전체 이력 대상).
 */
export default function CustomerHistoryPage() {
  return (
    <div className="p-4 md:p-6 max-w-full space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Archive size={20} className="text-brand-500" />
        <h1 className="text-2xl font-bold text-text-primary leading-tight">고객DB이력</h1>
      </div>
      <p className="text-xs text-text-secondary break-keep">
        고객관리·서비스관리에서 이력으로 이관한 데이터입니다.
        유형(정기딥/정기엔드/1회성)을 복수로 선택하고, 검색은 모든 필드에서 가능합니다.
        기본은 최근 30건만 표시되며, "더보기"로 전체를 열 수 있습니다.
        각 항목을 선택해 "고객관리로 되돌리기"로 이관 취소 가능하며, 상세 편집은 원래와 동일하게 지원됩니다.
      </p>

      <CustomersManagementView
        embedded
        archivedView
        initialCustomerTypes={['정기딥케어', '정기엔드케어', '1회성케어']}
        visibleFilterOptions={['정기딥케어', '정기엔드케어', '1회성케어']}
      />
    </div>
  )
}
