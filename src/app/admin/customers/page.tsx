'use client'

// Phase 3-G: 페이지는 얇은 wrapper. 실제 로직은 재사용 가능한 컴포넌트로 분리.
// 이 컴포넌트는 고객DB이력 탭에서도 embed 형태로 재사용된다.
import { CustomersManagementView } from '@/components/admin/customers/CustomersManagementView'

export default function Page() {
  return <CustomersManagementView />
}
