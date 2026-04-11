'use client'

import { useState } from 'react'

// ─── 타입 ────────────────────────────────────────────────────────

interface AutomationItem {
  id: string
  name: string
  description: string
  category: string
  active: boolean
  trigger: string
}

// ─── 데이터 ────────────────────────────────────────────────────────

const MAKE_TEAM_ID = 2567117
const MAKE_URL = `https://www.make.com/en/organization/${MAKE_TEAM_ID}/scenarios`

const INITIAL_ITEMS: AutomationItem[] = [
  {
    id: 'missed-call',
    name: '부재중 전화 자동 명함 발송',
    description: '부재중 전화가 감지되면 자동으로 카카오톡 또는 SMS로 명함 및 안내 메시지를 발송합니다.',
    category: '고객응대',
    active: true,
    trigger: 'Webhook (부재중 전화)',
  },
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
  '보고서': 'bg-purple-100 text-purple-700',
  '재고관리': 'bg-green-100 text-green-700',
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function AutomationPage() {
  const [items, setItems] = useState<AutomationItem[]>(INITIAL_ITEMS)
  const [showAddModal, setShowAddModal] = useState(false)

  const toggleActive = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, active: !item.active } : item
    ))
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
                onClick={() => toggleActive(item.id)}
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
