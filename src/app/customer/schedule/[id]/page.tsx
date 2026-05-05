import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, User, ClipboardList, Phone, MapPin, FolderOpen } from 'lucide-react'
import { ServiceSchedule, WorkPhoto, WorkChecklist, ClosingChecklist } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'
import { BeforeAfterSlider } from '@/components/customer/BeforeAfterSlider'
import { SatisfactionFormWrapper } from '@/components/customer/SatisfactionFormWrapper'

interface PageProps {
  params: { id: string }
}

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed'

interface ContractRow {
  id: string
  signing_status: SigningStatus
  service_plan: string | null
  visit_option: string | null
  monthly_price: number | null
  contract_start_date: string | null
  contract_end_date: string | null
  customer_agreed_at: string | null
}

interface CustomerJoin {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  address: string
  address_detail: string | null
  care_scope: string | null
  customer_type: string | null
  drive_folder_url: string | null
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: '납부완료', color: 'bg-state-success-bg text-state-success' },
  invoiced: { label: '청구됨', color: 'bg-state-info-bg text-state-info' },
  overdue: { label: '연체', color: 'bg-state-danger-bg text-state-danger' },
  pending: { label: '미청구', color: 'bg-surface-sunken text-text-secondary' },
}

const CONTRACT_STATUS_LABELS: Record<SigningStatus, string> = {
  draft: '검토 중',
  pending_customer: '서명 필요',
  customer_signed: '확인 대기',
  completed: '계약 완료',
}

const CONTRACT_STATUS_COLORS: Record<SigningStatus, string> = {
  draft: 'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed: 'bg-state-info-bg text-state-info',
  completed: 'bg-state-success-bg text-state-success',
}

const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  '정기딥케어': 'bg-indigo-100 text-indigo-700',
  '정기엔드케어': 'bg-brand-100 text-brand-700',
  '1회성케어': 'bg-surface-sunken text-text-secondary',
}

function formatPhone(phone: string): string {
  const p = phone.replace(/-/g, '')
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
  return phone
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR')
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
    .select(
      '*, customer:customers(id, business_name, contact_name, contact_phone, address, address_detail, care_scope, customer_type, drive_folder_url), worker:users(id, name, phone)'
    )
    .eq('id', scheduleId)
    .eq('customer_id', customerRow.id)
    .single()

  if (!schedule) notFound()

  const s = schedule as ServiceSchedule
  const customer = (s.customer as unknown as CustomerJoin | null)

  let photos: WorkPhoto[] = []
  let checklists: WorkChecklist[] = []
  let closing: ClosingChecklist | null = null

  if (s.status === 'completed') {
    const [photosRes, checklistsRes, closingRes] = await Promise.all([
      supabase
        .from('work_photos')
        .select('*')
        .eq('schedule_id', scheduleId)
        .in('photo_type', ['before', 'after'])
        .order('taken_at', { ascending: true }),
      supabase
        .from('work_checklists')
        .select('*')
        .eq('schedule_id', scheduleId),
      supabase
        .from('closing_checklists')
        .select('*')
        .eq('schedule_id', scheduleId)
        .maybeSingle(),
    ])
    photos = (photosRes.data ?? []) as WorkPhoto[]
    checklists = (checklistsRes.data ?? []) as WorkChecklist[]
    closing = closingRes.data as ClosingChecklist | null
  }

  let contract: ContractRow | null = null
  if (s.contract_id) {
    const { data: contractData } = await supabase
      .from('contracts')
      .select('id, signing_status, service_plan, visit_option, monthly_price, contract_start_date, contract_end_date, customer_agreed_at')
      .eq('id', s.contract_id)
      .maybeSingle()
    contract = contractData as ContractRow | null
  }

  const beforePhotos = photos.filter((p) => p.photo_type === 'before')
  const afterPhotos = photos.filter((p) => p.photo_type === 'after')

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
  const workerPhone = (s.worker as { phone?: string } | null)?.phone
  const paymentInfo = s.payment_status ? PAYMENT_STATUS_LABELS[s.payment_status] : null
  const hasRating = closing?.customer_rating != null
  const fullAddress = customer
    ? [customer.address, customer.address_detail].filter(Boolean).join(' ')
    : null

  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">

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
        {s.actual_arrival && s.actual_completion && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="text-xs text-text-tertiary">
              실제 작업: {format(new Date(s.actual_arrival), 'HH:mm')} ~{' '}
              {format(new Date(s.actual_completion), 'HH:mm')}
            </p>
          </div>
        )}
      </div>

      {/* 업체 정보 */}
      {customer && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">업체 정보</h2>
            {customer.customer_type && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                CUSTOMER_TYPE_COLORS[customer.customer_type] ?? 'bg-surface-sunken text-text-secondary'
              }`}>
                {customer.customer_type}
              </span>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="text-xs text-text-tertiary w-16 shrink-0 pt-0.5">업체명</span>
              <span className="text-sm text-text-primary font-semibold">{customer.business_name}</span>
            </div>
            {fullAddress && (
              <div className="flex items-start gap-3">
                <MapPin size={13} className="text-text-tertiary shrink-0 mt-0.5" />
                <span className="text-sm text-text-secondary">{fullAddress}</span>
              </div>
            )}
            {customer.contact_name && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-16 shrink-0 pt-0.5">담당자</span>
                <span className="text-sm text-text-primary">{customer.contact_name}</span>
              </div>
            )}
            {customer.contact_phone && (
              <div className="flex items-start gap-3">
                <Phone size={13} className="text-text-tertiary shrink-0 mt-0.5" />
                <a
                  href={`tel:${customer.contact_phone}`}
                  className="text-sm text-brand-600 font-medium"
                >
                  {formatPhone(customer.contact_phone)}
                </a>
              </div>
            )}
          </div>
        </section>
      )}

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
          {customer?.care_scope && (
            <div className="px-5 pb-4 pt-1">
              <div className="bg-surface-sunken rounded-xl p-3">
                <p className="text-xs text-text-tertiary mb-1">케어 범위</p>
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {customer.care_scope}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 담당 직원 */}
      {workerName && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">담당 직원</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <User size={16} className="text-brand-600" />
              </div>
              <span className="text-sm font-semibold text-text-primary">{workerName}</span>
            </div>
            {workerPhone && (
              <a
                href={`tel:${workerPhone}`}
                className="flex items-center gap-1.5 text-xs text-brand-600 font-medium bg-brand-50 px-3 py-1.5 rounded-full"
              >
                <Phone size={12} />
                전화하기
              </a>
            )}
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

      {/* 계약서 */}
      {contract && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">계약서</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CONTRACT_STATUS_COLORS[contract.signing_status]}`}>
              {CONTRACT_STATUS_LABELS[contract.signing_status]}
            </span>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            {contract.service_plan && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">서비스 플랜</span>
                <span className="text-sm text-text-primary font-medium">{contract.service_plan}</span>
              </div>
            )}
            {contract.visit_option && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">방문 옵션</span>
                <span className="text-sm text-text-primary font-medium">{contract.visit_option}</span>
              </div>
            )}
            {contract.monthly_price != null && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">월 금액</span>
                <span className="text-sm text-text-primary font-medium">
                  {Number(contract.monthly_price).toLocaleString()}원/월
                </span>
              </div>
            )}
            {(contract.contract_start_date || contract.contract_end_date) && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">계약 기간</span>
                <span className="text-sm text-text-primary font-medium">
                  {formatDate(contract.contract_start_date)} ~ {formatDate(contract.contract_end_date)}
                </span>
              </div>
            )}
            {contract.customer_agreed_at && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">서명 일시</span>
                <span className="text-sm text-text-primary font-medium">
                  {formatDate(contract.customer_agreed_at)}
                </span>
              </div>
            )}
            {contract.signing_status === 'pending_customer' && (
              <div className="mt-1 pt-3 border-t border-border-subtle">
                <Link
                  href={`/api/customer/contracts/${contract.id}/sign-link`}
                  className="text-sm text-brand-600 font-semibold"
                >
                  서명하러 가기 →
                </Link>
              </div>
            )}
            {contract.signing_status === 'completed' && (
              <div className="mt-1 pt-3 border-t border-border-subtle">
                <span className="text-xs text-state-success bg-state-success-bg px-3 py-1.5 rounded-lg font-medium">
                  계약이 성립되었습니다
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Google Drive 사진 폴더 */}
      {customer?.drive_folder_url && (
        <a
          href={customer.drive_folder_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between bg-surface rounded-2xl border border-border-subtle shadow-soft p-4 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <FolderOpen size={16} className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">사진 폴더 보기</p>
              <p className="text-xs text-text-tertiary mt-0.5">Google Drive에서 서비스 사진 확인</p>
            </div>
          </div>
          <ChevronLeft size={16} className="text-text-tertiary rotate-180" />
        </a>
      )}

      {/* 작업 사진 — BeforeAfterSlider (완료된 일정, 사진 있는 경우) */}
      {s.status === 'completed' && beforePhotos.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text-primary mb-3">작업 사진</h2>
          <div className="flex flex-col gap-4">
            {beforePhotos.map((before, idx) => {
              const after = afterPhotos[idx]
              if (after) {
                return (
                  <BeforeAfterSlider
                    key={before.id}
                    beforeUrl={before.photo_url}
                    afterUrl={after.photo_url}
                    label={s.items_this_visit?.[idx]?.name}
                  />
                )
              }
              return (
                <div key={before.id} className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
                  {s.items_this_visit?.[idx]?.name && (
                    <div className="px-4 py-2 bg-surface-sunken border-b border-border-subtle">
                      <p className="text-xs font-semibold text-text-secondary">{s.items_this_visit[idx].name}</p>
                    </div>
                  )}
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
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 작업 체크리스트 */}
      {checklists.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text-primary mb-3">작업 체크리스트</h2>
          <div className="flex flex-col gap-3">
            {checklists.map((cl) => (
              <div key={cl.id} className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
                <div className="px-4 py-3 bg-surface-sunken flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{cl.item_name}</h3>
                  {cl.is_completed ? (
                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">완료</span>
                  ) : (
                    <span className="text-xs bg-surface-sunken text-text-secondary px-2 py-0.5 rounded-full border border-border">미완료</span>
                  )}
                </div>
                <div className="divide-y divide-border-subtle">
                  {cl.checklist_items.map((item) => (
                    <div key={item.step} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        item.done ? 'bg-brand-600 border-brand-600' : 'border-border'
                      }`}>
                        {item.done && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${item.done ? 'text-text-secondary' : 'text-state-danger'}`}>
                        {item.step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 담당자 메모 */}
      {s.worker_memo && s.memo_visible && (
        <div className="bg-state-warning-bg rounded-2xl border border-amber-100 p-4">
          <p className="text-xs font-semibold text-state-warning mb-2 flex items-center gap-1">
            <ClipboardList size={13} />
            담당자 메모
          </p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{s.worker_memo}</p>
        </div>
      )}

      {/* 서비스 평가 — 완료 일정만 */}
      {s.status === 'completed' && (
        <section>
          <h2 className="text-sm font-bold text-text-primary mb-3">서비스 평가</h2>
          {hasRating && closing ? (
            <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`text-2xl ${
                        closing.customer_rating && star <= closing.customer_rating
                          ? 'text-yellow-400'
                          : 'text-text-tertiary'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <span className="text-lg font-bold text-text-primary">{closing.customer_rating}점</span>
              </div>
              {closing.customer_comment && (
                <p className="text-sm text-text-secondary bg-surface-sunken rounded-xl px-4 py-3">
                  {closing.customer_comment}
                </p>
              )}
            </div>
          ) : (
            <SatisfactionFormWrapper scheduleId={scheduleId} />
          )}
        </section>
      )}
    </div>
  )
}
