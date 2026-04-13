'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

interface AutomationItem {
  id: string
  name: string
  description: string
  category: string
  active: boolean
  trigger: string
  scenarioId?: number | null
}

// ─── 데이터 ────────────────────────────────────────────────────────

const MAKE_TEAM_ID = 2567117
const MAKE_URL = `https://www.make.com/en/organization/${MAKE_TEAM_ID}/scenarios`

const INITIAL_ITEMS: AutomationItem[] = [
  // ── 고객응대 ──────────────────────────────────────────────────
  {
    id: 'missed-call',
    name: '부재중 전화 자동 명함 발송',
    description: '부재중 전화가 감지되면 자동으로 카카오톡 또는 SMS로 명함 및 안내 메시지를 발송합니다.',
    category: '고객응대',
    active: true,
    trigger: 'Webhook (부재중 전화)',
  },

  // ── 예약알림 ──────────────────────────────────────────────────
  {
    id: 'schedule-notify-day-before',
    name: '예약 1일전 알림 자동 발송',
    description: '내일 시공 예정이고 배정완료 상태인 건에 SMS를 자동 발송합니다. 발송 후 Slack 보고.',
    category: '예약알림',
    active: true,
    trigger: '매일 오전 6시 (KST) (Make → /api/webhooks/schedule-notify)',
  },
  {
    id: 'schedule-notify-today',
    name: '예약 당일 알림 자동 발송',
    description: '오늘 시공 예정이고 배정완료 상태인 건에 SMS를 자동 발송합니다. 발송 후 Slack 보고.',
    category: '예약알림',
    active: true,
    trigger: '매일 오전 6시 (KST) (Make → /api/webhooks/schedule-notify)',
  },

  // ── 작업완료알림 ───────────────────────────────────────────────
  {
    id: 'work-complete-end-care',
    name: '정기엔드케어 작업완료 알림',
    description: '정기엔드케어 작업완료 시 카카오 알림톡 전용 템플릿으로 발송. SMS fallback 포함. 발송 후 Slack 보고.',
    category: '작업완료',
    active: true,
    trigger: '작업 완료 처리 시 자동 (1시간 후 또는 즉시)',
  },

  // ── 결제알림 ──────────────────────────────────────────────────
  {
    id: 'payment-notify-oneshot',
    name: '1회성케어 / 정기딥케어(월간) 결제알림',
    description: '작업완료 후 결제완료 전 건에 매일 결제 요청 SMS를 발송합니다. 결제완료 상태가 되면 자동 중단.',
    category: '결제알림',
    active: true,
    trigger: '매일 자동 (Make → /api/webhooks/payment-notify)',
  },
  {
    id: 'payment-notify-end-care',
    name: '정기엔드케어 결제알림',
    description: 'customers.payment_date가 오늘이고 이번달 미결제 건에 정기결제 SMS를 발송합니다.',
    category: '결제알림',
    active: true,
    trigger: '매일 자동 (Make → /api/webhooks/payment-notify)',
  },
  {
    id: 'payment-notify-yearly',
    name: '정기딥케어(연간) 계약 만료 알림',
    description: 'contract_end_date 30일 전부터 매일 연장 안내 SMS를 발송합니다.',
    category: '결제알림',
    active: true,
    trigger: '매일 자동 (Make → /api/webhooks/payment-notify)',
  },

  // ── 세금계산서 ────────────────────────────────────────────────
  {
    id: 'invoice-weekly',
    name: '세금계산서 자동화',
    description: '매주 토요일 해당 주 완료된 건 기준으로 세금계산서 발행 처리를 자동화합니다.',
    category: '세금계산서',
    active: false,
    trigger: '매주 토요일 (Make 시나리오)',
  },

  // ── Slack 보고 ────────────────────────────────────────────────
  {
    id: 'slack-all-notify',
    name: '모든 알림 Slack 실시간 보고',
    description: '수동/자동 발송 모든 알림을 Slack으로 실시간 보고합니다. 유형, 수신자, 발송시각, 발송방법 포함.',
    category: 'Slack',
    active: true,
    trigger: '알림 발송 시 자동 (SLACK_WEBHOOK_URL)',
  },

  // ── 보고서 / 재고 ─────────────────────────────────────────────
  {
    id: 'monthly-report',
    name: '월간 보고서 자동 생성',
    description: '매월 1일 자동으로 전월 데이터를 집계하여 관리자에게 보고서를 발송합니다.',
    category: '보고서',
    active: true,
    trigger: '매월 1일 00:00',
  },
  {
    id: 'inventory-alert',
    name: '재고 부족 알림',
    description: '재고 수량이 최소 기준 이하로 떨어지면 관리자에게 Slack 알림을 발송합니다.',
    category: '재고관리',
    active: false,
    trigger: '재고 변경 시 자동 감지',
  },
]

const CATEGORY_BADGE: Record<string, string> = {
  '고객응대': 'bg-blue-100 text-blue-700',
  '예약알림': 'bg-sky-100 text-sky-700',
  '작업완료': 'bg-green-100 text-green-700',
  '결제알림': 'bg-orange-100 text-orange-700',
  '세금계산서': 'bg-teal-100 text-teal-700',
  'Slack': 'bg-violet-100 text-violet-700',
  '보고서': 'bg-purple-100 text-purple-700',
  '재고관리': 'bg-emerald-100 text-emerald-700',
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function AutomationPage() {
  const [items, setItems] = useState<AutomationItem[]>(INITIAL_ITEMS)
  const [showAddModal, setShowAddModal] = useState(false)

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    const newActive = !item.active
    // UI 즉시 업데이트 (optimistic)
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: newActive } : i))

    try {
      await fetch('/api/admin/make-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: item.scenarioId ?? null, active: newActive }),
      })
      toast.success(newActive ? `${item.name} 활성화됨` : `${item.name} 비활성화됨`)
    } catch {
      // 네트워크 오류 시 UI 롤백
      setItems(prev => prev.map(i => i.id === id ? { ...i, active: item.active } : i))
      toast.error('상태 변경 실패')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">자동화관리</h1>
          <p className="text-xs text-gray-400 mt-0.5">Make.com 시나리오 기반 자동화</p>
        </div>
        <div className="flex gap-2">
          <a
            href={MAKE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <span>🔗</span> Make.com
          </a>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> 새 자동화
          </button>
        </div>
      </div>

      {/* 통계 배너 */}
      <div className="px-4 pb-3">
        <div className="bg-brand-50 rounded-xl p-4 flex items-center gap-6">
          <div>
            <p className="text-xs text-brand-600 font-medium">전체 시나리오</p>
            <p className="text-2xl font-bold text-brand-700">{items.length}개</p>
          </div>
          <div>
            <p className="text-xs text-green-600 font-medium">활성화</p>
            <p className="text-2xl font-bold text-green-700">{items.filter(i => i.active).length}개</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">비활성화</p>
            <p className="text-2xl font-bold text-gray-500">{items.filter(i => !i.active).length}개</p>
          </div>
        </div>
      </div>

      {/* 자동화 카드 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {items.map(item => (
          <div
            key={item.id}
            className={`bg-white rounded-xl border shadow-sm p-4 transition-colors ${
              item.active ? 'border-gray-100' : 'border-gray-100 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* 뱃지 + 이름 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[item.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.category}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.active ? '● 활성' : '○ 비활성'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-gray-900">{item.name}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.description}</p>
                {/* 트리거 */}
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs text-gray-400">트리거:</span>
                  <span className="text-xs text-gray-600 font-medium">{item.trigger}</span>
                </div>
              </div>
              {/* 토글 */}
              <button
                onClick={() => { void handleToggle(item.id) }}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 ${
                  item.active ? 'bg-brand-600' : 'bg-gray-300'
                }`}
                aria-label={item.active ? '비활성화' : '활성화'}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    item.active ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 새 자동화 안내 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">🤖</div>
            <h2 className="text-base font-bold text-gray-900 mb-2">새 자동화 추가</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              새로운 자동화 시나리오는{' '}
              <strong className="text-brand-600">Make.com</strong>에서 직접 설정합니다.{' '}
              아래 버튼을 눌러 Make.com 대시보드로 이동하세요.
            </p>
            <div className="space-y-2">
              <a
                href={MAKE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
              >
                Make.com 열기
              </a>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
