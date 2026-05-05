import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, User, FileText, ClipboardList } from 'lucide-react'
import { ServiceSchedule, WorkPhoto } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

interface PageProps {
  params: { id: string }
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: '납부완료', color: 'bg-state-success-bg text-state-success' },
  invoiced: { label: '청구됨', color: 'bg-state-info-bg text-state-info' },
  overdue: { label: '연체', color: 'bg-state-danger-bg text-state-danger' },
  pending: { label: '미청구', color: 'bg-surface-sunken text-text-secondary' },
}

export default async function CustomerScheduleDetailPage({ params }: PageProps) {
  const { id: scheduleId } = params
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (!customerRow) redirect('/customer')

  const { data: schedule } = await supabase
    .from('service_schedules')
    .select('*, customer:customers(id, business_name, address, address_detail), worker:users(id, name, phone)')
    .eq('id', scheduleId)
    .eq('customer_id', customerRow.id)
    .single()

  if (!schedule) notFound()

  const s = schedule as ServiceSchedule

  // 완료된 경우 사진 추가 조회
  let photos: WorkPhoto[] = []
  if (s.status === 'completed') {
    const { data: photoData } = await supabase
      .from('work_photos')
      .select('*')
      .eq('schedule_id', scheduleId)
      .in('photo_type', ['before', 'after'])
      .order('taken_at', { ascending: true })
    photos = (photoData ?? []) as WorkPhoto[]
  }

  const beforePhotos = photos.filter(p => p.photo_type === 'before')
  const afterPhotos = photos.filter(p => p.photo_type === 'after')

  const scheduledDate = new Date(s.scheduled_date)
  const isUpcomingDate = !isPast(scheduledDate) || isToday(scheduledDate)
  const isActive = s.status !== 'completed' && s.status !== 'cancelled'
  const dday = (() => {
    if (!isUpcomingDate || !isActive) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(s.scheduled_date)
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / 86400000)
  })()

  const workerName = (s.worker as { name?: string } | null)?.name
  const paymentInfo = s.payment_status ? PAYMENT_STATUS_LABELS[s.payment_status] : null

  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">

      {/* 뒤로가기 */}
      <Link
        href="/customer/schedule"
        className="flex items-center gap-1 text-brand-600 text-sm font-medium w-fit -ml-0.5"
      >
        <ChevronLeft size={16} />
        일정 목록
      </Link>

      {/* 날짜 + 상태 헤더 */}
      <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">
              {format(scheduledDate, 'yyyy년', { locale: ko })}
            </p>
            <h1 className="text-xl font-bold text-text-primary">
              {format(scheduledDate, 'M월 d일 (EEE)', { locale: ko })}
            </h1>
            {(s.scheduled_time_start || s.scheduled_time_end) && (
              <p className="text-sm text-text-secondary mt-1">
                {s.scheduled_time_start?.slice(0, 5)}
                {s.scheduled_time_end ? ` ~ ${s.scheduled_time_end.slice(0, 5)}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              SCHEDULE_STATUS_COLORS[s.status] ?? 'bg-surface-sunken text-text-secondary'
            }`}>
              {SCHEDULE_STATUS_LABELS[s.status] ?? s.status}
            </span>
            {dday !== null && (
              <span className={`text-sm font-black ${dday === 0 ? 'text-state-danger' : 'text-brand-600'}`}>
                {dday === 0 ? '오늘!' : `D-${dday}`}
              </span>
            )}
          </div>
        </div>

        {/* 실제 작업 시간 (완료된 경우) */}
        {s.actual_arrival && s.actual_completion && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="text-xs text-text-tertiary">
              실제 작업: {format(new Date(s.actual_arrival), 'HH:mm')} ~{' '}
              {format(new Date(s.actual_completion), 'HH:mm')}
            </p>
          </div>
        )}
      </div>

      {/* 서비스 항목 */}
      {s.items_this_visit?.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">서비스 항목</h2>
          </div>
          <div className="px-5 py-3.5 flex flex-col gap-2.5">
            {s.items_this_visit.map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" />
                <span className="text-sm text-text-primary font-medium">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 담당 직원 */}
      {workerName && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">담당 직원</h2>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <User size={16} className="text-brand-600" />
            </div>
            <span className="text-sm font-semibold text-text-primary">{workerName}</span>
          </div>
        </section>
      )}

      {/* 금액 정보 */}
      {s.payment_amount != null && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">금액 정보</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary mb-0.5">청구 금액</p>
              <p className="text-xl font-bold text-text-primary">
                {Number(s.payment_amount).toLocaleString()}원
              </p>
            </div>
            {paymentInfo && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${paymentInfo.color}`}>
                {paymentInfo.label}
              </span>
            )}
          </div>
        </section>
      )}

      {/* 견적서 보기 */}
      {s.contract_id && (
        <Link
          href="/customer/contracts"
          className="flex items-center justify-between bg-surface rounded-2xl border border-brand-100 shadow-soft p-4 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">계약서 보기</p>
              <p className="text-xs text-text-tertiary">계약 내용 및 견적 확인</p>
            </div>
          </div>
          <span className="text-text-tertiary text-lg leading-none">›</span>
        </Link>
      )}

      {/* 작업 사진 — 완료 후 사진 있는 경우 */}
      {s.status === 'completed' && beforePhotos.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text-primary mb-3">작업 사진</h2>
          <div className="flex flex-col gap-3">
            {beforePhotos.map((before, idx) => {
              const after = afterPhotos[idx]
              return (
                <div
                  key={before.id}
                  className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden"
                >
                  {s.items_this_visit?.[idx]?.name && (
                    <div className="px-4 py-2 bg-surface-sunken border-b border-border-subtle">
                      <p className="text-xs font-semibold text-text-secondary">
                        {s.items_this_visit[idx].name}
                      </p>
                    </div>
                  )}
                  <div className={`grid ${after ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <p className="text-[10px] font-bold text-text-tertiary text-center py-1.5 bg-surface-sunken border-b border-border-subtle">
                        작업 전
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={before.photo_url}
                        alt="작업 전"
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                    </div>
                    {after && (
                      <div className="border-l border-border-subtle">
                        <p className="text-[10px] font-bold text-text-tertiary text-center py-1.5 bg-surface-sunken border-b border-border-subtle">
                          작업 후
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={after.photo_url}
                          alt="작업 후"
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 담당자 메모 — 공개 설정된 경우만 */}
      {s.worker_memo && s.memo_visible && (
        <div className="bg-state-warning-bg rounded-2xl border border-amber-100 p-4">
          <p className="text-xs font-semibold text-state-warning mb-2 flex items-center gap-1">
            <ClipboardList size={13} />
            담당자 메모
          </p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{s.worker_memo}</p>
        </div>
      )}

      {/* 상세 리포트 보기 — 완료된 경우 */}
      {s.status === 'completed' && (
        <Link
          href={`/customer/reports/${scheduleId}`}
          className="flex items-center justify-center gap-2 bg-brand-600 text-white rounded-2xl py-3.5 font-semibold text-sm active:scale-[0.98] transition-transform shadow-soft"
        >
          상세 리포트 보기
        </Link>
      )}
    </div>
  )
}
