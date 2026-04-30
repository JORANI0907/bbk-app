import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { PasswordChangeForm } from '@/components/customer/PasswordChangeForm'

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
  '정기엔드케어': { label: '정기엔드케어', color: 'bg-blue-100 text-blue-700' },
  '1회성케어': { label: '1회성케어', color: 'bg-gray-100 text-gray-600' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '서비스 이용중', color: 'bg-green-100 text-green-700' },
  inactive: { label: '비활성', color: 'bg-gray-100 text-gray-500' },
  pending: { label: '대기중', color: 'bg-yellow-100 text-yellow-700' },
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium flex-1">{value}</span>
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
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">계정 정보</span>
        </div>
        <div className="px-5 py-1">
          <InfoRow label="이름" value={user.name} />
          <InfoRow label="아이디" value={user.phone ? formatPhone(user.phone) : undefined} />
        </div>
        <div className="px-5 pb-4 pt-1">
          <PasswordChangeForm />
        </div>
      </section>

      {/* 계약 정보 */}
      {customer && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">계약 정보</span>
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
            <div className="mx-5 mb-4 mt-1 bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">케어 범위</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.care_scope}</p>
            </div>
          )}
        </section>
      )}

      {/* 업체 정보 */}
      {customer && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <span className="text-sm font-bold text-gray-900">업체 정보</span>
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
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center bg-white rounded-2xl border border-gray-100">
          <span className="text-4xl">🏢</span>
          <p className="text-sm font-semibold text-gray-700">연결된 업체 정보가 없습니다</p>
          <p className="text-xs text-gray-400">관리자에게 문의해주세요.</p>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 pb-2">
        정보 변경은 담당자(<span className="text-gray-500 font-medium">031-759-4877</span>)에게 문의하세요.
      </p>
    </div>
  )
}
