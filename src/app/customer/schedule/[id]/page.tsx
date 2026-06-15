import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, User, Phone, FileText } from 'lucide-react'
import { ServiceSchedule, WorkPhoto, WorkChecklist } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'
import { BeforeAfterSlider } from '@/components/customer/BeforeAfterSlider'

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
  customer_type: string | null
  drive_folder_url: string | null
  business_number: string | null
}

interface ApplicationRow {
  construction_time: string | null
  care_scope: string | null
  supply_amount: number | null
  vat: number | null
  balance: number | null
  deposit: number | null
  drive_folder_url: string | null
  quote_url: string | null
  last_quote_pdf_url: string | null
  last_quote_no: string | null
  request_notes: string | null
  parking: string | null
  building_access: string | null
  elevator: string | null
  access_method: string | null
  payment_method: string | null
  account_number: string | null
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid:     { label: '납부완료', color: 'bg-state-success-bg text-state-success' },
  invoiced: { label: '청구됨',   color: 'bg-state-info-bg text-state-info' },
  overdue:  { label: '연체',     color: 'bg-state-danger-bg text-state-danger' },
  pending:  { label: '미청구',   color: 'bg-surface-sunken text-text-secondary' },
}

const CONTRACT_STATUS_LABELS: Record<SigningStatus, string> = {
  draft:            '검토 중',
  pending_customer: '서명 필요',
  customer_signed:  '확인 대기',
  completed:        '계약 완료',
}

const CONTRACT_STATUS_COLORS: Record<SigningStatus, string> = {
  draft:            'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed:  'bg-state-info-bg text-state-info',
  completed:        'bg-state-success-bg text-state-success',
}

const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  '정기딥케어':  'bg-indigo-100 text-indigo-700',
  '정기엔드케어': 'bg-brand-100 text-brand-700',
  '1회성케어':   'bg-surface-sunken text-text-secondary',
}

function formatPhone(phone: string): string {
  const p = phone.replace(/-/g, '')
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
  return phone
}

function formatConstructionTimeRange(t: string): string {
  const parts = t.split(':')
  const startH = parseInt(parts[0], 10)
  const startM = parseInt(parts[1] ?? '0', 10)
  if (isNaN(startH)) return t

  const endTotalMins = startH * 60 + startM + 120 // +2시간
  const endH = Math.floor(endTotalMins / 60)
  const endM = endTotalMins % 60

  const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
  const endStr   = endH >= 24
    ? `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`  // 24:00 그대로 표기
    : `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

  const suffix = endH > 24 ? ' (익일)' : ''
  return `${startStr} ~ ${endStr}${suffix}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-text-primary font-medium flex-1">{value}</span>
    </div>
  )
}

export default async function CustomerScheduleDetailPage({ params }: PageProps) {
  const { id: scheduleId } = params
  const session = getCustomerSession()
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
      '*, customer:customers(id, business_name, contact_name, contact_phone, address, address_detail, customer_type, drive_folder_url, business_number), worker:users(id, name)'
    )
    .eq('id', scheduleId)
    .eq('customer_id', customerRow.id)
    .is('deleted_at', null)
    .single()

  if (!schedule) notFound()

  const s = schedule as ServiceSchedule & { application_id?: string | null; worker_id?: string | null }
  const customer = (s.customer as unknown as CustomerJoin | null)

  // workers 테이블에서 전화번호 조회 (직원관리 기준)
  let workerPhoneFromWorkers: string | undefined
  if (s.worker_id) {
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('phone')
      .eq('user_id', s.worker_id)
      .maybeSingle()
    workerPhoneFromWorkers = workerRecord?.phone ?? undefined
  }

  // 연결된 service_applications 조회 (있을 때만)
  let application: ApplicationRow | null = null
  if (s.application_id) {
    const { data: appData } = await supabase
      .from('service_applications')
      .select(
        'construction_time, care_scope, supply_amount, vat, balance, deposit, drive_folder_url, quote_url, last_quote_pdf_url, last_quote_no, request_notes, parking, building_access, elevator, access_method, payment_method, account_number'
      )
      .eq('id', s.application_id)
      .maybeSingle()
    application = appData as ApplicationRow | null
  }

  let photos: WorkPhoto[] = []
  let checklists: WorkChecklist[] = []

  if (s.status === 'completed') {
    const [photosRes, checklistsRes] = await Promise.all([
      supabase
        .from('work_photos')
        .select('*')
        .eq('schedule_id', scheduleId)
        .in('photo_type', ['before', 'after'])
        .order('taken_at', { ascending: true }),
      supabase.from('work_checklists').select('*').eq('schedule_id', scheduleId),
    ])
    photos     = (photosRes.data     ?? []) as WorkPhoto[]
    checklists = (checklistsRes.data ?? []) as WorkChecklist[]
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
  const afterPhotos  = photos.filter((p) => p.photo_type === 'after')

  const scheduledDate  = new Date(s.scheduled_date)
  const isUpcomingDate = !isPast(scheduledDate) || isToday(scheduledDate)
  const isActive       = s.status !== 'completed' && s.status !== 'cancelled'
  const dday = (() => {
    if (!isUpcomingDate || !isActive) return null
    const today  = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(s.scheduled_date); target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / 86400000)
  })()

  const workerName  = (s.worker as { name?: string } | null)?.name
  const workerPhone = workerPhoneFromWorkers
  const paymentInfo = s.payment_status ? PAYMENT_STATUS_LABELS[s.payment_status] : null
  const fullAddress = customer ? [customer.address, customer.address_detail].filter(Boolean).join(' ') : null

  // 금액: application에 supply_amount가 있으면 우선, 없으면 payment_amount
  const quotedTotal   = application && application.supply_amount != null
    ? (application.supply_amount + (application.vat ?? 0))
    : null
  const supplyAmount  = application?.supply_amount ?? null
  const vatAmount     = application?.vat ?? null
  const deposit       = application?.deposit ?? null
  const balance       = application?.balance ?? null

  // 드라이브 링크: application 우선, 없으면 customer
  const driveFolderUrl = application?.drive_folder_url ?? customer?.drive_folder_url ?? null

  // 견적서 링크
  const quotePdfUrl = application?.last_quote_pdf_url ?? application?.quote_url ?? null
  const quoteNo     = application?.last_quote_no ?? null

  // 케어 범위
  const careScope = application?.care_scope ?? null

  // 시공시간
  const constructionTime = application?.construction_time
    ? formatConstructionTimeRange(application.construction_time)
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

      {/* ── 날짜 + 상태 헤더 ── */}
      <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">
              {format(scheduledDate, 'yyyy년', { locale: ko })}
            </p>
            <h1 className="text-xl font-bold text-text-primary">
              {format(scheduledDate, 'M월 d일 (EEE)', { locale: ko })}
            </h1>
            {constructionTime && (
              <p className="text-sm text-text-secondary mt-1">
                <span className="text-xs text-text-tertiary font-medium mr-1.5">시공시간</span>
                {constructionTime}
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

      {/* ── 업체 정보 ── */}
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
            <InfoRow label="업체명" value={<span className="font-semibold">{customer.business_name}</span>} />
            {fullAddress && <InfoRow label="주소" value={fullAddress} />}
            {customer.contact_name && <InfoRow label="담당자" value={customer.contact_name} />}
            {customer.contact_phone && (
              <InfoRow
                label="연락처"
                value={
                  <a href={`tel:${customer.contact_phone}`} className="text-brand-600 font-medium">
                    {formatPhone(customer.contact_phone)}
                  </a>
                }
              />
            )}
          </div>
        </section>
      )}

      {/* ── 작업장 정보 ── */}
      {(application?.parking || application?.building_access || application?.elevator || application?.access_method) && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">작업장 정보</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {application.parking && <InfoRow label="주차" value={application.parking} />}
            {application.building_access && <InfoRow label="건물출입" value={application.building_access} />}
            {application.elevator && <InfoRow label="엘리베이터" value={application.elevator} />}
            {application.access_method && <InfoRow label="출입방법" value={application.access_method} />}
          </div>
        </section>
      )}

      {/* ── 서비스 항목 ── */}
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

      {/* ── 금액 정보 ── */}
      {(quotedTotal != null || s.payment_amount != null) && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">금액 정보</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2.5">
            {/* 견적 기준 금액 (application에서) */}
            {supplyAmount != null && (
              <InfoRow label="공급가액" value={`${supplyAmount.toLocaleString()}원`} />
            )}
            {vatAmount != null && (
              <InfoRow label="부가세" value={`${vatAmount.toLocaleString()}원`} />
            )}
            {quotedTotal != null && (
              <div className="flex items-start gap-3 pt-1.5 border-t border-border-subtle">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">합계</span>
                <span className="text-lg font-bold text-text-primary">{quotedTotal.toLocaleString()}원</span>
              </div>
            )}
            {deposit != null && deposit > 0 && (
              <InfoRow label="예약금" value={`${deposit.toLocaleString()}원`} />
            )}
            {balance != null && balance > 0 && (
              <InfoRow label="잔금" value={`${balance.toLocaleString()}원`} />
            )}
            {/* service_schedules 기준 청구액 */}
            {s.payment_amount != null && quotedTotal == null && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">청구 금액</span>
                <span className="text-xl font-bold text-text-primary">{Number(s.payment_amount).toLocaleString()}원</span>
              </div>
            )}
            {s.payment_amount != null && quotedTotal != null && (
              <InfoRow label="청구 금액" value={`${Number(s.payment_amount).toLocaleString()}원`} />
            )}
          </div>
        </section>
      )}

      {/* ── 결제 정보 ── */}
      {(application?.payment_method || application?.account_number || customer?.business_number) && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">결제 정보</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {application?.payment_method && <InfoRow label="결제방법" value={application.payment_method} />}
            {application?.account_number && <InfoRow label="계좌번호" value={application.account_number} />}
            {customer?.business_number && <InfoRow label="사업자번호" value={customer.business_number} />}
          </div>
        </section>
      )}

      {/* ── 계약서 ── */}
      {contract && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">계약서</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CONTRACT_STATUS_COLORS[contract.signing_status]}`}>
              {CONTRACT_STATUS_LABELS[contract.signing_status]}
            </span>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            {contract.service_plan && <InfoRow label="서비스 플랜" value={contract.service_plan} />}
            {contract.visit_option && <InfoRow label="방문 옵션" value={contract.visit_option} />}
            {contract.monthly_price != null && (
              <InfoRow label="월 금액" value={`${Number(contract.monthly_price).toLocaleString()}원/월`} />
            )}
            {(contract.contract_start_date || contract.contract_end_date) && (
              <InfoRow
                label="계약 기간"
                value={`${formatDate(contract.contract_start_date)} ~ ${formatDate(contract.contract_end_date)}`}
              />
            )}
            {contract.customer_agreed_at && (
              <InfoRow label="서명 일시" value={formatDate(contract.customer_agreed_at)} />
            )}
            {contract.signing_status === 'pending_customer' && (
              <div className="mt-1 pt-3 border-t border-border-subtle">
                <Link href={`/api/customer/contracts/${contract.id}/sign-link`} className="text-sm text-brand-600 font-semibold">
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

      {/* ── 작업 사진 (완료 후 before/after) ── */}
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
                    <img src={before.photo_url} alt="작업 전" className="w-full aspect-square object-cover" loading="lazy" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 작업 체크리스트 ── */}
      {checklists.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text-primary mb-3">작업 체크리스트</h2>
          <div className="flex flex-col gap-3">
            {checklists.map((cl) => (
              <div key={cl.id} className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
                <div className="px-4 py-3 bg-surface-sunken flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{cl.item_name}</h3>
                  {cl.is_completed
                    ? <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">완료</span>
                    : <span className="text-xs bg-surface-sunken text-text-secondary px-2 py-0.5 rounded-full border border-border">미완료</span>
                  }
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

      {/* ── 담당 직원 ── */}
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

      {/* ── 시공 정보 ── */}
      {(careScope || application?.request_notes) && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">시공 정보</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {careScope && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">케어 범위</span>
                <div className="bg-surface-sunken rounded-xl p-3">
                  <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{careScope}</p>
                </div>
              </div>
            )}
            {application?.request_notes && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-tertiary">고객요청사항</span>
                <div className="bg-surface-sunken rounded-xl p-3">
                  <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{application.request_notes}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 견적서 ── */}
      {quotePdfUrl && (
        <a
          href={quotePdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between bg-surface rounded-2xl border border-border-subtle shadow-soft p-4 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">견적서 보기</p>
              {quoteNo && <p className="text-xs text-text-tertiary mt-0.5">No. {quoteNo}</p>}
            </div>
          </div>
          <ChevronLeft size={16} className="text-text-tertiary rotate-180" />
        </a>
      )}
    </div>
  )
}
