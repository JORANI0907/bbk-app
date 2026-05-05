import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Building2 } from 'lucide-react'

interface CustomerData {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  address: string | null
  address_detail: string | null
  business_number: string | null
  customer_type: string | null
  status: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  billing_next_date: string | null
  billing_cycle: string | null
  billing_amount: number | null
  care_scope: string | null
  next_visit_date: string | null
  visit_interval_days: number | null
}

function formatPhone(phone: string): string {
  const p = phone.replace(/-/g, '')
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
  return phone
}

const CUSTOMER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  '정기딥케어': { label: '정기딥케어', color: 'bg-indigo-100 text-indigo-700' },
  '정기엔드케어': { label: '정기엔드케어', color: 'bg-brand-100 text-brand-700' },
  '1회성케어': { label: '1회성케어', color: 'bg-surface-sunken text-text-secondary' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '서비스 이용중', color: 'bg-state-success-bg text-state-success' },
  inactive: { label: '비활성', color: 'bg-surface-sunken text-text-tertiary' },
  pending: { label: '대기중', color: 'bg-state-warning-bg text-state-warning' },
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-text-primary font-medium flex-1">{value}</span>
    </div>
  )
}

export default async function CustomerMyPage() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, phone, email')
    .eq('id', session.userId)
    .single()

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select(
      'id, business_name, contact_name, contact_phone, address, address_detail, ' +
      'business_number, customer_type, status, ' +
      'contract_start_date, contract_end_date, billing_next_date, billing_cycle, billing_amount, ' +
      'care_scope, next_visit_date, visit_interval_days'
    )
    .eq('user_id', session.userId)
    .maybeSingle()
  const customer = rawCustomer as CustomerData | null

  if (!user) redirect('/login')

  const typeInfo = customer?.customer_type ? CUSTOMER_TYPE_LABELS[customer.customer_type] : null
  const statusInfo = customer?.status ? STATUS_LABELS[customer.status] : null

  const formatDate = (d?: string | null) =>
    d ? format(new Date(d), 'yyyy년 M월 d일', { locale: ko }) : null

  const billingCycleLabel: Record<string, string> = {
    monthly: '월간 청구',
    annual: '연간 청구',
    onetime: '1회 청구',
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-4">

      {/* 계정 정보 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">계정 정보</span>
        </div>
        <div className="px-5 py-1 pb-4">
          <InfoRow label="이름" value={user.name} />
          <InfoRow label="아이디" value={user.phone ? formatPhone(user.phone) : undefined} />
        </div>
      </section>

      {/* 계약 정보 */}
      {customer && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">계약 정보</span>
            <div className="flex items-center gap-2">
              {typeInfo && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
              )}
              {statusInfo && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-1">
            <InfoRow label="계약 시작" value={formatDate(customer.contract_start_date)} />
            <InfoRow label="계약 만료" value={formatDate(customer.contract_end_date)} />
            <InfoRow label="다음 결제일" value={formatDate(customer.billing_next_date)} />
            {customer.billing_cycle && (
              <InfoRow label="청구 주기" value={billingCycleLabel[customer.billing_cycle] ?? customer.billing_cycle} />
            )}
            {customer.billing_amount != null && (
              <InfoRow
                label="청구 금액"
                value={`${Number(customer.billing_amount).toLocaleString()}원`}
              />
            )}
            <InfoRow label="다음 방문" value={formatDate(customer.next_visit_date)} />
            {customer.visit_interval_days && (
              <InfoRow label="방문 주기" value={`${customer.visit_interval_days}일마다`} />
            )}
          </div>
          {customer.care_scope && (
            <div className="mx-5 mb-4 mt-1 bg-surface-sunken rounded-xl p-3">
              <p className="text-xs text-text-tertiary mb-1">케어 범위</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{customer.care_scope}</p>
            </div>
          )}
        </section>
      )}

      {/* 업체 정보 */}
      {customer && (
        <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle">
            <span className="text-sm font-bold text-text-primary">업체 정보</span>
          </div>
          <div className="px-5 py-1">
            <InfoRow label="업체명" value={customer.business_name} />
            <InfoRow label="담당자" value={customer.contact_name} />
            <InfoRow
              label="연락처"
              value={customer.contact_phone ? formatPhone(customer.contact_phone) : null}
            />
            <InfoRow
              label="주소"
              value={[customer.address, customer.address_detail].filter(Boolean).join(' ')}
            />
          </div>
        </section>
      )}

      {!customer && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
          <Building2 size={40} className="text-text-tertiary" />
          <p className="text-sm font-semibold text-text-primary">연결된 업체 정보가 없습니다</p>
          <p className="text-xs text-text-tertiary">관리자에게 문의해주세요.</p>
        </div>
      )}

      <p className="text-center text-xs text-text-tertiary pb-2">
        정보 변경은 담당자(<span className="text-text-secondary font-medium">031-759-4877</span>)에게 문의하세요.
      </p>
    </div>
  )
}
