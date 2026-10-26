'use client'

import { useState, useEffect, useRef } from 'react'

// 고객관리 검색창 — 한글 입력(IME) 깨짐 방지용으로 분리 (2026-10-26)
//
// 문제: 검색어 state 가 5천 줄짜리 CustomersManagementView 에 있어서
//   글자 하나 칠 때마다 화면 전체가 다시 그려짐 → 모바일에서 느려지면
//   한글 조합 중에 커서가 맨 앞으로 튀어 '김' 이 'ㅁㅣㄱ' 으로 입력됨.
// 해결: 입력값은 이 컴포넌트 안에서만 관리(가벼운 재렌더),
//   부모에는 타이핑이 잠깐 멈췄을 때만 전달.
//   부모 → 이 컴포넌트 방향 동기화는 일부러 하지 않음: 늦게 도착한 값('기')이
//   지금 입력 중인 값('김')을 덮어써 다시 깨지기 때문. 지우기는 이 안의 ✕ 버튼만 사용.

const PUSH_DELAY_MS = 150

interface CustomerSearchInputProps {
  initialValue?: string
  onChange: (value: string) => void
  onFocusChange?: (focused: boolean) => void
  placeholder?: string
}

export function CustomerSearchInput({ initialValue = '', onChange, onFocusChange, placeholder }: CustomerSearchInputProps) {
  const [text, setText] = useState(initialValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const schedulePush = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(next), PUSH_DELAY_MS)
  }

  const handleClear = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setText('')
    onChange('')
  }

  return (
    <div className="relative w-full">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      {/* text-base(16px) on mobile: iOS 는 16px 미만 입력창에 포커스하면 화면을 확대해 글자가 가려짐 */}
      <input
        type="search"
        enterKeyHint="search"
        value={text}
        onChange={e => {
          setText(e.target.value)
          schedulePush(e.target.value)
        }}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2.5 text-base md:text-sm text-text-primary border border-border rounded-xl bg-surface shadow-soft focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="검색어 지우기"
          // mousedown 기본동작을 막아 포커스 유지 → 필터가 다시 펼쳐지며 버튼이 밀리는 현상 방지
          onMouseDown={e => e.preventDefault()}
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary text-sm"
        >
          ✕
        </button>
      )}
    </div>
  )
}
