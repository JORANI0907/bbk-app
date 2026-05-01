import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
  admin_signed_at: string | null
  created_at: string
}

const STATUS_LABELS: Record<SigningStatus, string> = {
  draft: '검토 중',
  pending_customer: '서명 필요',
  customer_signed: '확인 대기',
  completed: '계약 완료',
}

const STATUS_COLORS: Record<SigningStatus, string> = {
  draft: 'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed: 'bg-state-info-bg text-state-info',
  completed: 'bg-state-success-bg text-state-success',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function formatPrice(price: number | null): string {
  if (!price) return '-'
  return `${price.toLocaleString('ko-KR')}원/월`
}

export default async function CustomerContractsPage() {
  const session = getServerSession()
  if (!session) redirect('/login')

  const supabase = createServiceClient()

  // 고객 ID 조회
  const { data: user } = await supabase
    .from('users')
    .select('id, customer_id')
    .eq('id', session.userId)
    .single()

  if (!user?.customer_id) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">계약서</h1>
        <div className="bg-surface rounded-2xl shadow-soft p-12 text-center text-text-tertiary text-sm">
          연결된 고객 정보가 없습니다.
        </div>
      </div>
    )
  }

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, signing_status, service_plan, visit_option, monthly_price, contract_start_date, contract_end_date, customer_agreed_at, admin_signed_at, created_at')
    .eq('customer_id', user.customer_id as string)
    .order('created_at', { ascending: false })

  if (error || !contracts) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">계약서</h1>
        <div className="bg-surface rounded-2xl shadow-soft p-12 text-center text-text-tertiary text-sm">
          계약서를 불러오지 못했습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-bold text-text-primary">계약서</h1>

      {contracts.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-soft p-12 text-center text-text-tertiary text-sm">
          계약서가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {(contracts as ContractRow[]).map((contract) => {
            const isCompleted = contract.signing_status === 'completed'
            const needsSign = contract.signing_status === 'pending_customer'

            return (
              <div
                key={contract.id}
                className={`bg-surface rounded-2xl border p-5 ${
                  needsSign
                    ? 'border-state-warning shadow-card'
                    : 'border-border-subtle shadow-soft'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-base font-semibold text-text-primary">
                      {contract.service_plan ?? '계약서'}
                    </p>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {contract.visit_option ?? '-'} · {formatPrice(contract.monthly_price)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${
                      STATUS_COLORS[contract.signing_status] ?? ''
                    }`}
                  >
                    {STATUS_LABELS[contract.signing_status] ?? contract.signing_status}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-text-tertiary mb-4">
                  <p>계약 기간: {formatDate(contract.contract_start_date)} ~ {formatDate(contract.contract_end_date)}</p>
                  {contract.customer_agreed_at && (
                    <p>서명 일시: {formatDate(contract.customer_agreed_at)}</p>
                  )}
                  {contract.admin_signed_at && (
                    <p>확인 일시: {formatDate(contract.admin_signed_at)}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  {isCompleted && (
                    <span className="text-xs text-state-success bg-state-success-bg px-3 py-1.5 rounded-lg font-medium">
                      계약이 성립되었습니다
                    </span>
                  )}
                  {needsSign && (
                    <Link
                      href={`/api/customer/contracts/${contract.id}/sign-link`}
                      className="text-sm text-brand-600 font-medium hover:underline"
                    >
                      서명하러 가기 →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
