/**
 * 구역(탭) 파스텔 색 — Tailwind 는 문자열을 그대로 읽어야 하므로 클래스 전체를 적어 둔다.
 * 쓰는 곳: 탭, 카드 왼쪽 띠, 항목 번호 동그라미, 칩. 본문 글자는 항상 진회색.
 */

import type { ZoneColor } from '@/types/care-manual'

export interface ZoneTheme {
  /** 활성 탭 */
  tabActive: string
  /** 비활성 탭 호버 */
  tabHover: string
  /** 카드 왼쪽 띠 */
  bar: string
  /** 항목 번호 동그라미 */
  badge: string
  /** 연한 배경 (칩, 요약 띠) */
  soft: string
  /** 진한 글자색 (칩 글자) */
  ink: string
  /** 색 이름 (툴팁용) */
  label: string
  /** 색 선택 점 */
  dot: string
}

export const ZONE_THEME: Record<ZoneColor, ZoneTheme> = {
  sky: {
    tabActive: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200',
    tabHover: 'hover:bg-sky-50',
    bar: 'bg-sky-300',
    badge: 'bg-sky-100 text-sky-700',
    soft: 'bg-sky-50',
    ink: 'text-sky-700',
    label: '하늘',
    dot: 'bg-sky-300',
  },
  mint: {
    tabActive: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
    tabHover: 'hover:bg-emerald-50',
    bar: 'bg-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700',
    soft: 'bg-emerald-50',
    ink: 'text-emerald-700',
    label: '민트',
    dot: 'bg-emerald-300',
  },
  apricot: {
    tabActive: 'bg-orange-100 text-orange-900 ring-1 ring-orange-200',
    tabHover: 'hover:bg-orange-50',
    bar: 'bg-orange-300',
    badge: 'bg-orange-100 text-orange-700',
    soft: 'bg-orange-50',
    ink: 'text-orange-700',
    label: '살구',
    dot: 'bg-orange-300',
  },
  lavender: {
    tabActive: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200',
    tabHover: 'hover:bg-violet-50',
    bar: 'bg-violet-300',
    badge: 'bg-violet-100 text-violet-700',
    soft: 'bg-violet-50',
    ink: 'text-violet-700',
    label: '라벤더',
    dot: 'bg-violet-300',
  },
  lemon: {
    tabActive: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
    tabHover: 'hover:bg-amber-50',
    bar: 'bg-amber-300',
    badge: 'bg-amber-100 text-amber-700',
    soft: 'bg-amber-50',
    ink: 'text-amber-700',
    label: '레몬',
    dot: 'bg-amber-300',
  },
  rose: {
    tabActive: 'bg-rose-100 text-rose-900 ring-1 ring-rose-200',
    tabHover: 'hover:bg-rose-50',
    bar: 'bg-rose-300',
    badge: 'bg-rose-100 text-rose-700',
    soft: 'bg-rose-50',
    ink: 'text-rose-700',
    label: '로즈',
    dot: 'bg-rose-300',
  },
}

/** 3D 모형·SVG 처럼 Tailwind 클래스를 못 쓰는 곳용 hex (Tailwind *-300 과 같은 값) */
export const ZONE_HEX: Record<ZoneColor, string> = {
  sky: '#7dd3fc',
  mint: '#6ee7b7',
  apricot: '#fdba74',
  lavender: '#c4b5fd',
  lemon: '#fcd34d',
  rose: '#fda4af',
}

export const FREQUENCY_LABEL: Record<string, string> = {
  every: '매회', weekly: '주 1회', biweekly: '격주', monthly: '월 1회',
}
