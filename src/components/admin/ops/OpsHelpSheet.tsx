'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  X,
  Home,
  Target,
  BarChart2,
  Users,
  MessageSquare,
  Bell,
  FileText,
  AlertCircle,
} from 'lucide-react'

interface OpsHelpSheetProps {
  open: boolean
  onClose: () => void
}

const HELP_ITEMS = [
  {
    icon: <Home size={15} />,
    title: '홈 대시보드',
    path: '/admin',
    desc: '상단에서 대표 의도 배너, 심장박동 4타일(오늘 완료·미완료·클레임·면담), 이달 숫자 5타일, 임박 항목 리스트를 확인합니다.',
  },
  {
    icon: <Target size={15} />,
    title: '대표 의도',
    path: '/admin/ops/settings/intent',
    desc: '이번 달 회사가 집중할 방향을 한 줄로 입력합니다. 저장하면 홈 상단 배너에 즉시 반영됩니다.',
  },
  {
    icon: <BarChart2 size={15} />,
    title: '지표 설정',
    path: '/admin/ops/settings/metrics',
    desc: '17개 운영 지표의 활성화 여부와 대시보드 노출 여부를 토글로 설정합니다. 목표값 입력 시 즉시 저장됩니다.',
  },
  {
    icon: <Users size={15} />,
    title: '기능 담당',
    path: '/admin/ops/settings/functions',
    desc: '15개 기능별 담당자와 백업 담당자를 드롭다운으로 배정합니다. 선택 즉시 자동 저장됩니다.',
  },
  {
    icon: <MessageSquare size={15} />,
    title: '분기 면담',
    path: '/admin/ops/interviews',
    desc: '분기별 직원 면담 기록을 등록하고 목록으로 관리합니다. 면담 일자·대상·내용을 입력합니다.',
  },
  {
    icon: <Bell size={15} />,
    title: '주간 공지',
    path: '/admin/notices → 주간공지 탭',
    desc: '공지·이벤트관리에서 주간공지 탭을 선택합니다. 3줄(100자) 편집, AI 초안 자동 생성, 발행 기능을 제공합니다.',
  },
  {
    icon: <FileText size={15} />,
    title: '월간 회의',
    path: '/admin/reports 하단',
    desc: '월간보고서 페이지 하단에서 이달 회의 기록(매출·남는돈)을 카드 형태로 입력하고 저장합니다.',
  },
  {
    icon: <AlertCircle size={15} />,
    title: '고객 클레임',
    path: '/admin/claims',
    desc: '고객 클레임을 등록하고 미해결/전체 세그먼트로 관리합니다. 해결 완료 또는 재작업 요청 상태를 변경할 수 있습니다.',
  },
]

export function OpsHelpSheet({ open, onClose }: OpsHelpSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleClose = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, handleClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="운영 기능 사용 안내"
    >
      {/* 딤 오버레이 */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 시트 */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-sm h-full bg-surface shadow-modal flex flex-col"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <div>
            <p className="text-base font-bold text-text-primary">운영 기능 사용 안내</p>
            <p className="text-xs text-text-tertiary mt-0.5">Phase 1 v2 · 총 8개 기능</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {HELP_ITEMS.map((item, idx) => (
            <div key={idx} className="bg-surface-sunken rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-brand-600">{item.icon}</span>
                <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                <span className="ml-auto text-[11px] text-text-tertiary tabular-nums">{idx + 1}/8</span>
              </div>
              <p className="text-xs text-brand-600 font-medium break-keep">{item.path}</p>
              <p className="text-sm text-text-secondary leading-normal break-keep">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t border-border-subtle shrink-0">
          <p className="text-xs text-text-tertiary text-center">운영 기능은 관리자(admin) 전용입니다</p>
        </div>
      </div>
    </div>
  )
}
