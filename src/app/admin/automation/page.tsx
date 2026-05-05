'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { MarketingAgentSummary } from '@/components/admin/automation/MarketingAgentSummary'
import { MessageCircle, Clock, Package, Layers, Link, PenLine, ClipboardList, Megaphone, FileText, Phone as PhoneIcon, Bot, Bell, Brain, Tag, Monitor, Palette, Crown } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────

interface AutomationItem {
  id: string
  name: string
  description: string
  category: string
  active: boolean
  trigger: string
  slackEnabled: boolean   // Slack 보고 여부
  scenarioId?: number | null
}

interface ActivityItem {
  id: string
  name: string
  description: string
  icon: string
  trigger: string
}

// ─── Make.com 자동화 시나리오 ─────────────────────────────────────

const MAKE_TEAM_ID = 2567117
const MAKE_URL = `https://www.make.com/en/organization/${MAKE_TEAM_ID}/scenarios`

const INITIAL_ITEMS: AutomationItem[] = [
  // ── 고객응대 ──────────────────────────────────────────────────
  {
    id: 'missed-call',
    name: '부재중 전화 자동 명함 발송',
    description: '부재중 전화 감지 시 카카오톡/SMS로 명함과 안내 메시지를 자동 발송합니다.',
    category: '고객응대',
    active: true,
    trigger: 'Webhook (부재중 전화 감지)',
    slackEnabled: true,
  },

  // ── 예약알림 ──────────────────────────────────────────────────
  {
    id: 'schedule-notify-day-before',
    name: '예약 1일전 알림 자동 발송',
    description: '내일 시공 예정 + 배정완료 건에 SMS를 자동 발송합니다. 발송 건마다 Slack 보고.',
    category: '예약알림',
    active: true,
    trigger: '매일 오전 6시 (KST) → /api/webhooks/schedule-notify',
    slackEnabled: true,
  },
  {
    id: 'schedule-notify-today',
    name: '예약 당일 알림 자동 발송',
    description: '오늘 시공 예정 + 배정완료 건에 SMS를 자동 발송합니다. 발송 건마다 Slack 보고.',
    category: '예약알림',
    active: true,
    trigger: '매일 오전 6시 (KST) → /api/webhooks/schedule-notify',
    slackEnabled: true,
  },

  // ── 작업완료 ──────────────────────────────────────────────────
  {
    id: 'work-complete-notify',
    name: '작업완료 알림 자동 발송',
    description: '작업완료 처리 시 카카오 알림톡(SMS fallback)을 자동 발송합니다. Slack 보고.',
    category: '작업완료',
    active: true,
    trigger: '작업 완료 처리 시 자동',
    slackEnabled: true,
  },

  // ── 결제알림 ──────────────────────────────────────────────────
  {
    id: 'payment-notify-oneshot',
    name: '1회성케어 · 정기딥케어 결제알림',
    description: '작업완료 후 결제완료 전 건에 매일 결제 요청 SMS를 발송합니다. 발송 건마다 Slack 보고.',
    category: '결제알림',
    active: true,
    trigger: '매일 자동 → /api/webhooks/payment-notify',
    slackEnabled: true,
  },
  {
    id: 'payment-notify-end-care',
    name: '정기엔드케어 결제알림',
    description: '매월 결제일 도래 후 이번 달 미결제 고객에게 알림톡(SMS fallback)을 발송합니다. 결제 완료될 때까지 매일 반복.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
  },
  {
    id: 'payment-notify-annual-billing',
    name: '정기딥케어(연간) 결제알림',
    description: '연간 결제 예정일이 도래한 미결제 건에 알림톡(SMS fallback)을 발송합니다. 결제 완료될 때까지 매일 반복.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
  },
  {
    id: 'payment-notify-yearly',
    name: '정기딥케어(연간) 계약 만료 알림',
    description: '계약 만료 30일 전부터 매일 연장 안내 SMS를 발송합니다. Slack 보고.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
  },

  // ── 서비스생성 ───────────────────────────────────────────────
  {
    id: 'portal-account-create',
    name: '고객 포털 계정 자동 생성',
    description: '고객 등록 시 연락처가 있으면 포털 계정({전화번호}@customer.bbk.co.kr)을 자동 생성합니다. auth_user → users → customers.user_id 순으로 매핑됩니다.',
    category: '서비스생성',
    active: true,
    trigger: '고객 등록 시 즉시 → /api/admin/customers POST',
    slackEnabled: false,
  },
  {
    id: 'service-app-bulk-create',
    name: '정기케어 월간 일정 수동 생성',
    description: '관리자가 고객 선택 후 "다음달 일정 생성" 버튼 클릭 시 visit_schedule_type 기반으로 service_applications를 일괄 생성합니다. 중복 날짜는 자동 건너뜁니다.',
    category: '서비스생성',
    active: true,
    trigger: '관리자 수동 실행 → /api/admin/customers/generate-schedules POST',
    slackEnabled: false,
  },
  {
    id: 'cron-auto-schedule',
    name: '정기케어 월간 일정 Cron 자동 생성',
    description: '매월 23일 09:00 KST에 활성 정기딥케어/정기엔드케어 고객 전체를 대상으로 다음달 방문 일정을 자동 생성합니다. 생성 후 고객에게 예약확정 알림톡을 발송합니다.\n※ 일정 생성 기준일은 23일로 고정되며, 고객별 별도 설정은 지원하지 않습니다.',
    category: '서비스생성',
    active: true,
    trigger: '매월 23일 09:00 KST (Make 시나리오 #8990139) → /api/cron/auto-schedule GET',
    slackEnabled: false,
  },
  {
    id: 'service-schedules-sync',
    name: 'service_schedules 자동 동기화',
    description: '서비스 신청서에서 담당자(assigned_to) 또는 시공일자 변경 시 service_schedules 테이블에 자동으로 반영합니다. 정기엔드케어는 고객 단가도 자동 매핑합니다.',
    category: '서비스생성',
    active: true,
    trigger: '신청서 수정 시 즉시 → /api/admin/applications PATCH',
    slackEnabled: false,
  },

  // ── 세금계산서 ────────────────────────────────────────────────
  {
    id: 'invoice-weekly',
    name: '세금계산서 자동화',
    description: '매주 토요일 해당 주 완료 건 기준으로 세금계산서 발행 처리를 자동화합니다.',
    category: '세금계산서',
    active: false,
    trigger: '매주 토요일 (Make 시나리오)',
    slackEnabled: false,
  },

  // ── 보고서 ────────────────────────────────────────────────────
  {
    id: 'monthly-report',
    name: '월간 보고서 자동 생성',
    description: '매월 1일 전월 데이터를 집계하여 관리자에게 보고서를 발송합니다.',
    category: '보고서',
    active: true,
    trigger: '매월 1일 00:00 (KST)',
    slackEnabled: true,
  },

  // ── 재고관리 ──────────────────────────────────────────────────
  {
    id: 'inventory-alert',
    name: '재고 부족 자동 알림',
    description: '재고 수량이 최소 기준 이하로 떨어지면 Slack으로 부족 알림을 발송합니다.',
    category: '재고관리',
    active: true,
    trigger: '재고 입출고 처리 시 자동 감지',
    slackEnabled: true,
  },
]

// ─── 앱 실시간 Slack 활동 알림 ────────────────────────────────────

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'slack-notify-alimtalk',
    name: '카카오 알림톡 / SMS 발송',
    description: '수동·자동 발송 모든 알림을 건마다 Slack으로 실시간 보고합니다. 유형, 수신자, 발송시각, 발송방법 포함.',
    icon: 'message',
    trigger: '알림 발송 시 즉시',
  },
  {
    id: 'slack-attendance',
    name: '직원 출퇴근 기록',
    description: '직원이 출근 또는 퇴근 기록을 남길 때마다 Slack으로 이름·시간을 보고합니다.',
    icon: 'clock',
    trigger: '출퇴근 기록 시 즉시',
  },
  {
    id: 'slack-inventory-tx',
    name: '재고 입출고',
    description: '재고 입고·수령·반납·수량조정 처리 시 품목명, 수량, 처리자를 Slack으로 보고합니다.',
    icon: 'package',
    trigger: '입출고 처리 시 즉시',
  },
  {
    id: 'slack-inventory-crud',
    name: '재고 품목 추가 · 수정 · 삭제',
    description: '관리자가 재고 품목을 추가·수정·삭제할 때마다 Slack으로 변경 내역을 보고합니다.',
    icon: 'layers',
    trigger: '품목 변경 시 즉시',
  },
  {
    id: 'slack-requests-new',
    name: '새 요청 등록',
    description: '직원 또는 관리자가 새 요청을 등록할 때마다 Slack으로 요청자, 카테고리, 내용을 보고합니다.',
    icon: 'clipboard',
    trigger: '요청 등록 시 즉시',
  },
  {
    id: 'slack-requests-done',
    name: '요청 처리 · 완료',
    description: '관리자가 요청을 처리(완료/반려)할 때마다 Slack으로 처리 결과를 보고합니다.',
    icon: 'clipboard',
    trigger: '요청 처리 시 즉시',
  },
]

// ─── 카테고리 스타일 ───────────────────────────────────────────────

const CATEGORY_BADGE: Record<string, string> = {
  '고객응대':   'bg-brand-100 text-brand-700',
  '예약알림':   'bg-sky-100 text-sky-700',
  '작업완료':   'bg-state-success-bg text-state-success',
  '결제알림':   'bg-orange-100 text-orange-700',
  '서비스생성': 'bg-indigo-100 text-indigo-700',
  '세금계산서': 'bg-teal-100 text-teal-700',
  '보고서':     'bg-purple-100 text-purple-700',
  '재고관리':   'bg-emerald-100 text-emerald-700',
}

const CATEGORY_ORDER = ['고객응대', '예약알림', '작업완료', '결제알림', '서비스생성', '세금계산서', '보고서', '재고관리']

// ─── 활동 아이콘 맵 ───────────────────────────────────────────────

const ACTIVITY_ICON_MAP: Record<string, React.ReactNode> = {
  message:   <MessageCircle size={14} />,
  clock:     <Clock size={14} />,
  package:   <Package size={14} />,
  layers:    <Layers size={14} />,
  clipboard: <ClipboardList size={14} />,
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────

export default function AutomationPage() {
  const router = useRouter()
  const [items, setItems] = useState<AutomationItem[]>(INITIAL_ITEMS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'make' | 'activity' | 'agents' | 'marketing' | 'contracts'>('make')

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    const newActive = !item.active
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: newActive } : i))

    try {
      await fetch('/api/admin/make-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: item.scenarioId ?? null, active: newActive }),
      })
      toast.success(newActive ? `${item.name} 활성화됨` : `${item.name} 비활성화됨`)
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, active: item.active } : i))
      toast.error('상태 변경 실패')
    }
  }

  // 카테고리별로 그룹핑
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: items.filter(i => i.category === cat),
  })).filter(g => g.items.length > 0)

  const activeCount = items.filter(i => i.active).length
  const inactiveCount = items.filter(i => !i.active).length

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-text-primary">자동화관리</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Make.com 시나리오 + 앱 실시간 Slack 알림</p>
        </div>
        <div className="flex gap-2">
          <a
            href={MAKE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-text-secondary text-sm font-medium rounded-xl hover:bg-surface-sunken transition-colors"
          >
            <Link size={14} /> Make.com
          </a>
          <Button onClick={() => setShowAddModal(true)}>
            <span className="text-base leading-none">+</span> 새 자동화
          </Button>
        </div>
      </div>

      {/* 통계 배너 */}
      <div className="px-4 pb-3 shrink-0">
        <div className="bg-brand-50 rounded-xl p-4 grid grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-brand-600 font-medium">Make 시나리오</p>
            <p className="text-xl font-bold text-brand-700">{items.length}개</p>
          </div>
          <div>
            <p className="text-xs text-state-success font-medium">활성화</p>
            <p className="text-xl font-bold text-state-success">{activeCount}개</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary font-medium">비활성화</p>
            <p className="text-xl font-bold text-text-secondary">{inactiveCount}개</p>
          </div>
          <div>
            <p className="text-xs text-violet-600 font-medium">Slack 알림</p>
            <p className="text-xl font-bold text-violet-700">{ACTIVITY_ITEMS.length + items.filter(i => i.slackEnabled).length}개</p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex bg-surface-sunken rounded-xl p-1 gap-1 flex-wrap">
          {(
            [
              { key: 'make',      label: <><Bot size={14} className="inline" /> Make.com</>   },
              { key: 'activity',  label: <><Bell size={14} className="inline" /> Slack 알림</>  },
              { key: 'agents',    label: <><Brain size={14} className="inline" /> 에이전트</>    },
              { key: 'marketing', label: <><Megaphone size={14} className="inline" /> 마케팅</>      },
              { key: 'contracts', label: <><PenLine size={14} className="inline" /> 계약서 서명</>  },
            ] as { key: 'make' | 'activity' | 'agents' | 'marketing' | 'contracts'; label: React.ReactNode }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-[80px] py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === key ? 'bg-surface text-text-primary shadow-flat' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* ── Make.com 자동화 탭 ── */}
        {activeTab === 'make' && (
          <div className="space-y-5">
            {grouped.map(({ category, items: catItems }) => (
              <div key={category}>
                {/* 카테고리 헤더 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CATEGORY_BADGE[category] ?? 'bg-surface-sunken text-text-secondary'}`}>
                    {category}
                  </span>
                  <div className="flex-1 h-px bg-border-subtle" />
                  <span className="text-xs text-text-tertiary">{catItems.filter(i => i.active).length}/{catItems.length} 활성</span>
                </div>

                {/* 카테고리 내 아이템들 */}
                <div className="space-y-2">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      className={`bg-surface rounded-xl border p-4 transition-all ${
                        item.active ? 'border-border-subtle shadow-soft' : 'border-border-subtle opacity-55'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* 상태 + Slack 뱃지 */}
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              item.active ? 'bg-state-success-bg text-state-success' : 'bg-surface-sunken text-text-secondary'
                            }`}>
                              {item.active ? '● 활성' : '○ 비활성'}
                            </span>
                            {item.slackEnabled && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                Slack 보고
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-text-primary">{item.name}</h3>
                          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{item.description}</p>
                          <div className="flex items-center gap-1 mt-2">
                            <span className="text-[11px] text-text-tertiary">트리거:</span>
                            <span className="text-[11px] text-text-secondary font-medium">{item.trigger}</span>
                          </div>
                        </div>
                        {/* 토글 */}
                        <button
                          onClick={() => { void handleToggle(item.id) }}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 ${
                            item.active ? 'bg-brand-600' : 'bg-border'
                          }`}
                          aria-label={item.active ? '비활성화' : '활성화'}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            item.active ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 에이전트 현황 탭 ── */}
        {activeTab === 'agents' && (
          <div className="space-y-3">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-violet-800 mb-1">Claude Code 에이전트 시스템</p>
              <p className="text-xs text-violet-600 leading-relaxed">
                BBK Lead를 포함한 10개 에이전트의 관계도와 실시간 활동을 확인할 수 있습니다.
              </p>
            </div>
            {/* 에이전트 요약 카드 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <Tag size={16} />, name: 'BBK Lead',    role: '요구사항 분석 / 분배', color: 'text-violet-700' },
                { icon: <Monitor size={16} />, name: 'Developer',   role: 'Next.js / Supabase',   color: 'text-brand-700'  },
                { icon: <Palette size={16} />, name: 'Designer',    role: 'UI/UX 컴포넌트',       color: 'text-cyan-700'   },
                { icon: <Crown size={16} />, name: 'MKT Leader',  role: '마케팅 팀장',           color: 'text-amber-700'  },
              ].map(({ icon, name, role, color }) => (
                <div key={name} className="bg-surface border border-border-subtle rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{icon}</span>
                    <span className={`text-xs font-bold ${color}`}>{name}</span>
                  </div>
                  <p className="text-[10px] text-text-secondary">{role}</p>
                </div>
              ))}
            </div>
            <Button
              onClick={() => router.push('/admin/automation/agents')}
              className="w-full flex items-center justify-between px-4 py-3 bg-violet-600 hover:bg-violet-700"
            >
              <div className="flex items-center gap-2">
                <Brain size={14} />
                <span className="text-sm font-semibold">전체 에이전트 현황 보기</span>
              </div>
              <span className="text-sm opacity-80">→</span>
            </Button>
          </div>
        )}

        {/* ── 마케팅 에이전트 탭 ── */}
        {activeTab === 'marketing' && (
          <div>
            <MarketingAgentSummary />
          </div>
        )}

        {/* ── 실시간 Slack 알림 탭 ── */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            {/* 안내 배너 */}
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-violet-800 mb-1">앱 모든 활동 → Slack 실시간 보고</p>
              <p className="text-xs text-violet-600 leading-relaxed">
                아래 항목들은 앱에서 활동이 발생할 때마다 자동으로 Slack에 보고됩니다.
                <br />SLACK_WEBHOOK_URL 환경변수가 설정되어 있으면 즉시 활성화됩니다.
              </p>
            </div>

            {ACTIVITY_ITEMS.map(item => (
              <div key={item.id} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    {ACTIVITY_ICON_MAP[item.icon] ?? null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-bg text-state-success">
                        ● 활성
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        Slack 보고
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-text-primary">{item.name}</h3>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">{item.description}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-[11px] text-text-tertiary">발송 시점:</span>
                      <span className="text-[11px] text-text-secondary font-medium">{item.trigger}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        {/* ── 계약서 서명 사용 가이드 탭 ── */}
        {activeTab === 'contracts' && (
          <div className="space-y-4">

            {/* 안내 배너 */}
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-brand-800 mb-1">온라인 계약서 서명 — SMS OTP 방식</p>
              <p className="text-xs text-brand-600 leading-relaxed">
                외부 플랫폼 없이 앱 내에서 계약서를 발송하고, 고객이 SMS 본인인증으로 서명합니다.
                서명 시점의 계약서 내용과 타임스탬프·IP가 DB에 영구 기록됩니다.
              </p>
            </div>

            {/* 전체 흐름 */}
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">전체 흐름</p>
              <div className="space-y-2">
                {[
                  { step: '1', color: 'bg-brand-600',             label: '관리자',  text: '계약서 작성 — 고객 선택 시 정보 자동 채움' },
                  { step: '2', color: 'bg-sky-500',               label: '관리자',  text: '서명 요청 발송 — 고객 전화번호로 SMS 링크 전송' },
                  { step: '3', color: 'bg-emerald-500',           label: '고객',    text: '링크 접속 → 계약서 확인 → 조항 체크박스 동의' },
                  { step: '4', color: 'bg-violet-500',            label: '고객',    text: 'OTP 인증 — 휴대폰 번호 입력 → 인증번호 수신 → 입력' },
                  { step: '5', color: 'bg-orange-500',            label: '관리자',  text: 'Slack 알림 수신 → 최종 확인 클릭 → 계약 완료' },
                ].map(({ step, color, label, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full ${color} text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                      {step}
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-text-tertiary uppercase mr-1.5">{label}</span>
                      <span className="text-xs text-text-primary">{text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 관리자 사용법 */}
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">관리자 사용법</p>
              <div className="space-y-3">
                {[
                  {
                    icon: <ClipboardList size={14} />,
                    title: '1. 계약서 작성',
                    desc: '사이드바 → 영업관리 → 온라인 계약서 → "새 계약서 작성" 버튼\n고객을 선택하면 상호·사업자번호·대표자·주소·연락처·이메일이 자동 채워집니다.\n서비스 플랜(3/6/12개 순환식), 방문 옵션(월 1~3회), 금액을 입력합니다.',
                  },
                  {
                    icon: <Megaphone size={14} />,
                    title: '2. 서명 요청 발송',
                    desc: '계약서 상세 화면에서 "서명 요청 발송" 버튼 클릭\n고객 전화번호로 서명 링크 SMS가 발송됩니다. (링크 유효기간 7일)\n상태가 "서명 대기"로 변경됩니다.',
                  },
                  {
                    icon: <PenLine size={14} />,
                    title: '3. 최종 확인',
                    desc: '고객이 서명 완료 시 Slack으로 알림이 옵니다.\n계약서 상세 화면에서 "최종 확인 완료" 버튼을 클릭하면 계약이 성립됩니다.\n고객에게 계약 완료 SMS가 자동 발송됩니다.',
                  },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                      {icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-text-primary mb-0.5">{title}</p>
                      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-line">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 고객 서명 방법 */}
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">고객 서명 방법 (고객 화면)</p>
              <div className="space-y-3">
                {[
                  {
                    icon: <Link size={14} />,
                    title: 'SMS 링크 클릭',
                    desc: '로그인 없이 바로 계약서 화면이 열립니다.',
                  },
                  {
                    icon: <FileText size={14} />,
                    title: '계약서 내용 확인',
                    desc: '전체 계약서를 스크롤해서 읽습니다.\n제8조(서비스 제공 장소 동의), 제14조(개인정보 보호 동의) 포함 체크박스 3개를 모두 체크해야 "서명하기" 버튼이 활성화됩니다.',
                  },
                  {
                    icon: <PhoneIcon size={14} />,
                    title: 'SMS OTP 인증',
                    desc: '"서명하기" 버튼 → 본인 휴대폰 번호 입력 → "인증번호 발송"\n6자리 인증번호를 입력하면 서명이 완료됩니다.\n타임스탬프와 IP가 자동 기록됩니다.',
                  },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      {icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-text-primary mb-0.5">{title}</p>
                      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-line">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 상태 안내 */}
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">계약서 상태 안내</p>
              <div className="space-y-2">
                {[
                  { status: '작성 중',      color: 'bg-surface-sunken text-text-secondary', desc: '계약서 작성 완료 전 (서명 요청 전)' },
                  { status: '서명 대기',    color: 'bg-sky-100 text-sky-700',              desc: '고객에게 SMS 발송 완료, 고객 서명 대기 중' },
                  { status: '고객 서명 완료', color: 'bg-amber-100 text-amber-700',         desc: '고객 OTP 인증 완료, 관리자 최종 확인 필요' },
                  { status: '계약 완료',    color: 'bg-state-success-bg text-state-success', desc: '관리자 최종 확인 완료, 계약 성립' },
                ].map(({ status, color, desc }) => (
                  <div key={status} className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${color}`}>{status}</span>
                    <span className="text-[11px] text-text-secondary">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 바로가기 버튼 */}
            <button
              onClick={() => router.push('/admin/contracts')}
              className="w-full flex items-center justify-between px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2">
                <PenLine size={14} />
                <span className="text-sm font-semibold">계약서 관리 바로가기</span>
              </div>
              <span className="text-sm opacity-80">→</span>
            </button>

          </div>
        )}

      {/* 새 자동화 안내 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm shadow-modal p-6 text-center">
            <div className="flex justify-center mb-3"><Bot size={40} /></div>
            <h2 className="text-base font-bold text-text-primary mb-2">새 자동화 추가</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
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
              <Button
                variant="secondary"
                onClick={() => setShowAddModal(false)}
                className="w-full py-2.5"
              >
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
