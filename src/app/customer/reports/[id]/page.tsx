import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule, WorkPhoto, WorkChecklist, ClosingChecklist } from '@/types/database'
import { BeforeAfterSlider } from '@/components/customer/BeforeAfterSlider'
import { SatisfactionFormWrapper } from './SatisfactionFormWrapper'

interface PageProps {
  params: { id: string }
}

export default async function CustomerReportDetailPage({ params }: PageProps) {
  const { id: scheduleId } = params
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: schedule } = await supabase
    .from('service_schedules')
    .select('*, customer:customers(*)')
    .eq('id', scheduleId)
    .single()

  if (!schedule || schedule.status !== 'completed') notFound()

  const typedSchedule = schedule as ServiceSchedule

  const { data: photos } = await supabase
    .from('work_photos')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('taken_at', { ascending: true })

  const { data: checklists } = await supabase
    .from('work_checklists')
    .select('*')
    .eq('schedule_id', scheduleId)

  const { data: closingData } = await supabase
    .from('closing_checklists')
    .select('*')
    .eq('schedule_id', scheduleId)
    .single()

  const typedPhotos = (photos ?? []) as WorkPhoto[]
  const typedChecklists = (checklists ?? []) as WorkChecklist[]
  const closing = closingData as ClosingChecklist | null

  const beforePhotos = typedPhotos.filter((p) => p.photo_type === 'before')
  const afterPhotos = typedPhotos.filter((p) => p.photo_type === 'after')

  const hasRating = closing?.customer_rating != null

  return (
    <div className="px-4 py-5 flex flex-col gap-6">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-xs text-gray-400 mb-1">서비스 완료</p>
        <h1 className="text-xl font-bold text-gray-900">
          {format(new Date(typedSchedule.scheduled_date), 'yyyy년 M월 d일 (EEE)', {
            locale: ko,
          })}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {typedSchedule.items_this_visit.map((i) => i.name).join(', ') || '청소 서비스'}
        </p>
        {typedSchedule.actual_arrival && typedSchedule.actual_completion && (
          <p className="text-xs text-gray-400 mt-2">
            {format(new Date(typedSchedule.actual_arrival), 'HH:mm')} ~{' '}
            {format(new Date(typedSchedule.actual_completion), 'HH:mm')} 작업
          </p>
        )}
      </div>

      {/* Before/After 슬라이더 */}
      {beforePhotos.length > 0 && afterPhotos.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-gray-900">작업 전/후 비교</h2>
          {beforePhotos.map((beforePhoto, idx) => {
            const afterPhoto = afterPhotos[idx]
            if (!afterPhoto) return null
            return (
              <BeforeAfterSlider
                key={beforePhoto.id}
                beforeUrl={beforePhoto.photo_url}
                afterUrl={afterPhoto.photo_url}
                label={
                  typedSchedule.items_this_visit[idx]?.name
                    ? `${typedSchedule.items_this_visit[idx].name}`
                    : undefined
                }
              />
            )
          })}
        </div>
      )}

      {/* 작업 체크리스트 결과 */}
      {typedChecklists.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-gray-900">작업 체크리스트</h2>
          {typedChecklists.map((cl) => (
            <div
              key={cl.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">{cl.item_name}</h3>
                {cl.is_completed ? (
                  <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                    완료
                  </span>
                ) : (
                  <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                    미완료
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {cl.checklist_items.map((item) => (
                  <div
                    key={item.step}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        item.done
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {item.done && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        item.done ? 'text-gray-500' : 'text-red-400'
                      }`}
                    >
                      {item.step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 만족도 평가 */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">서비스 평가</h2>
        {hasRating && closing ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    className={`text-2xl ${
                      closing.customer_rating && s <= closing.customer_rating
                        ? 'text-yellow-400'
                        : 'text-gray-200'
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="text-lg font-bold text-gray-700">
                {closing.customer_rating}점
              </span>
            </div>
            {closing.customer_comment && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
                {closing.customer_comment}
              </p>
            )}
          </div>
        ) : (
          <SatisfactionFormWrapper scheduleId={scheduleId} />
        )}
      </div>
    </div>
  )
}
