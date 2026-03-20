import { ServiceSchedule } from '@/types/database'
import { WORK_STEPS, SCHEDULE_STATUS_COLORS, SCHEDULE_STATUS_LABELS } from '@/lib/constants'

interface Props {
  schedule: ServiceSchedule
  onPress: () => void
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: '미결제',
  invoiced: '청구됨',
  paid: '결제완료',
  overdue: '연체',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  invoiced: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

export function ScheduleCard({ schedule, onPress }: Props) {
  const customer = schedule.customer
  const currentStep = schedule.work_step

  const stepInfo =
    currentStep > 0
      ? WORK_STEPS.find((s) => s.step === currentStep)
      : null

  const formatTime = (time: string) => {
    return time.slice(0, 5)
  }

  return (
    <button
      onClick={onPress}
      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">
            {customer?.business_name ?? '고객 정보 없음'}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {customer?.address ?? '-'}
            {customer?.address_detail ? ` ${customer.address_detail}` : ''}
          </p>
        </div>
        <span
          className={`ml-2 shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
            PAYMENT_STATUS_COLORS[schedule.payment_status]
          }`}
        >
          {PAYMENT_STATUS_LABELS[schedule.payment_status]}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>
            {formatTime(schedule.scheduled_time_start)} ~{' '}
            {formatTime(schedule.scheduled_time_end)}
          </span>
        </div>

        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            SCHEDULE_STATUS_COLORS[schedule.status]
          }`}
        >
          {SCHEDULE_STATUS_LABELS[schedule.status]}
        </span>

        {stepInfo && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
            <span>{stepInfo.icon}</span>
            <span>
              Step {stepInfo.step}: {stepInfo.label}
            </span>
          </span>
        )}

        {currentStep === 0 && schedule.status !== 'completed' && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            대기 중
          </span>
        )}

        {schedule.status === 'completed' && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
            ✅ 작업 완료
          </span>
        )}
      </div>

      {schedule.items_this_visit.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {schedule.items_this_visit.slice(0, 3).map((item) => (
            <span
              key={item.id}
              className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
            >
              {item.name}
            </span>
          ))}
          {schedule.items_this_visit.length > 3 && (
            <span className="text-xs text-gray-400">
              +{schedule.items_this_visit.length - 3}개
            </span>
          )}
        </div>
      )}
    </button>
  )
}
