import type { ReactNode } from 'react'
import { Trash2, Home, Building2, Users, TrendingUp, Settings, Activity } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────

export type ColorKey = 'home' | 'sales' | 'hr' | 'finance' | 'ops' | 'app' | 'trash'

export interface NavLeaf {
  type: 'leaf'
  id: string
  href: string
  label: string
  icon: ReactNode
  roles: string[]
  badgeKey?: string
  colorKey?: ColorKey
}

export interface NavChild {
  href: string
  label: string
  badgeKey?: string
}

export interface NavGroup {
  type: 'group'
  id: string
  label: string
  icon: ReactNode
  roles: string[]
  children: NavChild[]
  hasHelp?: boolean
  colorKey?: ColorKey
}

export type NavItem = NavLeaf | NavGroup

// 그룹별 색상 팔레트. Tailwind purge 안전하게 명시적 클래스 사용.
export const COLOR_MAP: Record<ColorKey, {
  icon: string
  hover: string
  activeBg: string
  activeText: string
  border: string
  childActiveBg: string
  childActiveText: string
}> = {
  home:    { icon: 'text-brand-600',   hover: 'hover:bg-brand-50',   activeBg: 'bg-brand-100',   activeText: 'text-brand-800',   border: 'border-brand-300',   childActiveBg: 'bg-brand-50',   childActiveText: 'text-brand-700' },
  sales:   { icon: 'text-blue-600',    hover: 'hover:bg-blue-50',    activeBg: 'bg-blue-100',    activeText: 'text-blue-800',    border: 'border-blue-300',    childActiveBg: 'bg-blue-50',    childActiveText: 'text-blue-700' },
  hr:      { icon: 'text-orange-600',  hover: 'hover:bg-orange-50',  activeBg: 'bg-orange-100',  activeText: 'text-orange-800',  border: 'border-orange-300',  childActiveBg: 'bg-orange-50',  childActiveText: 'text-orange-700' },
  finance: { icon: 'text-emerald-600', hover: 'hover:bg-emerald-50', activeBg: 'bg-emerald-100', activeText: 'text-emerald-800', border: 'border-emerald-300', childActiveBg: 'bg-emerald-50', childActiveText: 'text-emerald-700' },
  ops:     { icon: 'text-violet-600',  hover: 'hover:bg-violet-50',  activeBg: 'bg-violet-100',  activeText: 'text-violet-800',  border: 'border-violet-300',  childActiveBg: 'bg-violet-50',  childActiveText: 'text-violet-700' },
  app:     { icon: 'text-slate-600',   hover: 'hover:bg-slate-100',  activeBg: 'bg-slate-200',   activeText: 'text-slate-800',   border: 'border-slate-300',   childActiveBg: 'bg-slate-100',  childActiveText: 'text-slate-800' },
  trash:   { icon: 'text-red-500',     hover: 'hover:bg-red-50',     activeBg: 'bg-red-100',     activeText: 'text-red-700',     border: 'border-red-300',     childActiveBg: 'bg-red-50',     childActiveText: 'text-red-700' },
}

// ─── 메뉴 정의 ────────────────────────────────────────────────
// 각 항목에 안정된 id 부여 (레이아웃 저장/복원의 키).
// 그룹은 role별로 별도 정의되지만 id는 카테고리 기준으로 통일.

export const NAV_ITEMS: NavItem[] = [
  { type: 'leaf', id: 'home', href: '/admin', label: '홈', icon: <Home size={16} />, roles: ['admin', 'worker'], colorKey: 'home' },
  {
    type: 'group',
    id: 'sales',
    label: '영업관리',
    icon: <Building2 size={16} />,
    roles: ['admin'],
    colorKey: 'sales',
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/customers', label: '고객관리' },
      { href: '/admin/customer-history', label: '고객DB이력' },
      { href: '/admin/franchise-hq', label: '프렌차이즈 본사' },
      { href: '/admin/quotes', label: '견적관리' },
      { href: '/admin/contracts', label: '계약서 관리' },
      { href: '/admin/snippets', label: '문자 단축어' },
    ],
  },
  {
    type: 'group',
    id: 'sales',
    label: '영업관리',
    icon: <Building2 size={16} />,
    roles: ['worker'],
    colorKey: 'sales',
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/customers', label: '고객관리' },
      // 워커도 문자 단축어 접근 허용 — API 가 worker_visible=true 만 필터해서 반환.
      { href: '/admin/snippets', label: '문자 단축어' },
    ],
  },
  {
    type: 'group',
    id: 'hr',
    label: '인사·현장관리',
    icon: <Users size={16} />,
    roles: ['admin'],
    colorKey: 'hr',
    children: [
      { href: '/admin/live', label: '오늘의 현장 (라이브)' },
      { href: '/admin/map', label: '지도 대시보드' },
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/regular-care', label: '장비관리보고' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서', badgeKey: 'incidents' },
      { href: '/admin/claims', label: '고객 클레임' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
    ],
  },
  {
    type: 'group',
    id: 'hr',
    label: '인사·현장관리',
    icon: <Users size={16} />,
    roles: ['worker'],
    colorKey: 'hr',
    children: [
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/worker/regular-care', label: '장비관리보고' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서', badgeKey: 'incidents' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
    ],
  },
  {
    type: 'group',
    id: 'finance',
    label: '재무관리',
    icon: <TrendingUp size={16} />,
    roles: ['admin'],
    colorKey: 'finance',
    children: [
      { href: '/admin/finance', label: '재무 대시보드' },
      { href: '/admin/finance/details', label: '매출매입 상세' },
      { href: '/admin/payroll', label: '급여정산' },
      { href: '/admin/tax-invoice', label: '세금계산서 발행' },
    ],
  },
  {
    type: 'group',
    id: 'ops',
    label: '운영',
    icon: <Activity size={16} />,
    roles: ['admin'],
    colorKey: 'ops',
    hasHelp: true,
    children: [
      { href: '/admin/ops/dashboard', label: '운영 관리 대시보드' },
      { href: '/admin/ops/settings/intent', label: '대표 의도' },
      { href: '/admin/ops/settings/metrics', label: '지표 설정' },
      { href: '/admin/ops/settings/functions', label: '기능 담당' },
      { href: '/admin/ops/interviews', label: '분기 면담' },
    ],
  },
  {
    type: 'group',
    id: 'app',
    label: '앱관리',
    icon: <Settings size={16} />,
    roles: ['admin'],
    colorKey: 'app',
    children: [
      { href: '/admin/notices', label: '공지사항', badgeKey: 'notices' },
      { href: '/admin/automation', label: '자동화관리' },
      { href: '/admin/notification-templates', label: '문자알림 관리' },
      { href: '/admin/push', label: '앱알림 관리' },
      { href: '/admin/nav-settings', label: '하단 메뉴 설정' },
      { href: '/admin/permissions', label: '탭 권한 설정' },
      { href: '/admin/members', label: '회원관리' },
    ],
  },
  {
    type: 'group',
    id: 'app',
    label: '앱관리',
    icon: <Settings size={16} />,
    roles: ['worker'],
    colorKey: 'app',
    children: [
      { href: '/admin/account', label: '계정관리' },
    ],
  },
  { type: 'leaf', id: 'trash', href: '/admin/trash', label: '휴지통', icon: <Trash2 size={16} />, roles: ['admin'], colorKey: 'trash' },
]

// role에 맞는 항목만 필터링해서 반환.
export function getNavItemsForRole(role: string): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.includes(role))
}
