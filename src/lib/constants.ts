import { PipelineStatus, ScheduleStatus } from '@/types/database'

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  inquiry: '문의',
  quote_sent: '견적 발송',
  consulting: '상담 중',
  contracted: '계약 완료',
  schedule_assigned: '일정 배정',
  service_scheduled: '서비스 예정',
  service_done: '서비스 완료',
  payment_done: '결제 완료',
  subscription_active: '구독 활성',
  renewal_pending: '갱신 예정',
  churned: '이탈',
}

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: '예정',
  confirmed: '확정',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소',
  rescheduled: '일정 변경',
}

export const SCHEDULE_STATUS_COLORS: Record<ScheduleStatus, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rescheduled: 'bg-yellow-100 text-yellow-700',
}

export const WORK_STEPS = [
  { step: 1, label: '현장 도착', icon: '📍', description: '현장 위치 확인 및 도착 기록' },
  { step: 2, label: 'Before 촬영', icon: '📸', description: '작업 전 상태 사진 촬영' },
  { step: 3, label: '작업 수행', icon: '🧹', description: '체크리스트 항목별 작업' },
  { step: 4, label: 'After 촬영', icon: '✨', description: '작업 후 상태 사진 촬영' },
  { step: 5, label: '완료 보고', icon: '✅', description: '마감 체크리스트 확인 및 완료' },
]

export const SERVICE_GRADE_LABELS = {
  Z_WHITE: 'Z White',
  G_BLUE: 'G Blue',
  D_BLACK: 'D Black',
}

export const PIPELINE_KANBAN_COLUMNS: { status: PipelineStatus; label: string; color: string }[] = [
  { status: 'inquiry', label: '문의', color: 'bg-gray-50 border-gray-200' },
  { status: 'consulting', label: '상담/견적', color: 'bg-blue-50 border-blue-200' },
  { status: 'contracted', label: '계약 완료', color: 'bg-purple-50 border-purple-200' },
  { status: 'subscription_active', label: '구독 활성', color: 'bg-green-50 border-green-200' },
  { status: 'renewal_pending', label: '갱신 예정', color: 'bg-yellow-50 border-yellow-200' },
  { status: 'churned', label: '이탈', color: 'bg-red-50 border-red-200' },
]

export const INVENTORY_CATEGORY_LABELS = {
  chemical: '약품',
  equipment: '장비',
  consumable: '소모품',
  other: '기타',
}
