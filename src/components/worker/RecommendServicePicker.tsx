'use client'

import { useState, useMemo } from 'react'
import { RecommendationPriority } from '@/types/database'

export type RecommendationState = Record<
  string,
  { reason: string; priority: RecommendationPriority }
>

interface ServiceItem {
  name: string
  category: '주방' | '홀' | '기타'
}

const DEEP_CARE_ITEMS: ServiceItem[] = [
  // 주방 (26)
  { name: '후드·덕트', category: '주방' },
  { name: '가스레인지', category: '주방' },
  { name: '간택기', category: '주방' },
  { name: '튀김기', category: '주방' },
  { name: '식기세척기', category: '주방' },
  { name: '냉장고선반형', category: '주방' },
  { name: '냉장고밧드', category: '주방' },
  { name: '냉장고쇼케이스', category: '주방' },
  { name: '전자레인지', category: '주방' },
  { name: '오븐', category: '주방' },
  { name: '인덕션', category: '주방' },
  { name: '밥솥', category: '주방' },
  { name: '커피머신', category: '주방' },
  { name: '에스프레소머신', category: '주방' },
  { name: '제빙기', category: '주방' },
  { name: '냉동고', category: '주방' },
  { name: '정수기', category: '주방' },
  { name: '주방바닥', category: '주방' },
  { name: '주방벽면', category: '주방' },
  { name: '주방보조선반', category: '주방' },
  { name: '작업대', category: '주방' },
  { name: '싱크대', category: '주방' },
  { name: '트렌치·트랩', category: '주방' },
  { name: '그리스트랩', category: '주방' },
  { name: '배수구', category: '주방' },
  { name: '주방환풍기', category: '주방' },
  // 홀 (8)
  { name: '테이블·의자', category: '홀' },
  { name: '홀바닥', category: '홀' },
  { name: '유리창·창틀', category: '홀' },
  { name: '입구유리문', category: '홀' },
  { name: '장식장·진열장', category: '홀' },
  { name: '에어컨 실내기', category: '홀' },
  { name: '테이블덕트', category: '홀' },
  { name: '카운터', category: '홀' },
  // 기타 (9)
  { name: '양변기', category: '기타' },
  { name: '소변기', category: '기타' },
  { name: '세면대', category: '기타' },
  { name: '거울', category: '기타' },
  { name: '화장실타일', category: '기타' },
  { name: '화장실환풍기', category: '기타' },
  { name: '천장·조명', category: '기타' },
  { name: '배기팬', category: '기타' },
]

const END_CARE_ITEMS: ServiceItem[] = [
  // 주방 (13)
  { name: '설거지', category: '주방' },
  { name: '조리도구 정리', category: '주방' },
  { name: '식자재 정리', category: '주방' },
  { name: '싱크대 정리', category: '주방' },
  { name: '가스레인지 닦기', category: '주방' },
  { name: '작업대 소독', category: '주방' },
  { name: '주방 선반 정리', category: '주방' },
  { name: '냉장고 닦기', category: '주방' },
  { name: '전자레인지 닦기', category: '주방' },
  { name: '인덕션 닦기', category: '주방' },
  { name: '주방 바닥', category: '주방' },
  { name: '주방 벽면', category: '주방' },
  { name: '트렌치 정리', category: '주방' },
  // 홀 (12)
  { name: '테이블 소독', category: '홀' },
  { name: '의자 정리', category: '홀' },
  { name: '카운터 닦기', category: '홀' },
  { name: '메뉴판 닦기', category: '홀' },
  { name: '선반 닦기', category: '홀' },
  { name: '장식장 닦기', category: '홀' },
  { name: '홀 바닥', category: '홀' },
  { name: '매트 청소', category: '홀' },
  { name: '소파·쿠션', category: '홀' },
  { name: '쓰레기 배출', category: '홀' },
  { name: '음식물 처리', category: '홀' },
  { name: '분리수거', category: '홀' },
  // 기타 (17)
  { name: '양변기 청소', category: '기타' },
  { name: '소변기 청소', category: '기타' },
  { name: '세면대 닦기', category: '기타' },
  { name: '거울 닦기', category: '기타' },
  { name: '화장실 청소', category: '기타' },
  { name: '화장실 타일', category: '기타' },
  { name: '환풍기 그릴', category: '기타' },
  { name: '화장실 소모품', category: '기타' },
  { name: '입구 유리문', category: '기타' },
  { name: '현관 바닥', category: '기타' },
  { name: '간판 닦기', category: '기타' },
  { name: '재떨이 정리', category: '기타' },
  { name: '손잡이 소독', category: '기타' },
  { name: '포스기 닦기', category: '기타' },
  { name: '소모품 보충', category: '기타' },
  { name: '행주 세탁', category: '기타' },
  { name: '에어컨 점검', category: '기타' },
]

type FilterTab = '전체' | '주방' | '홀' | '기타'

const PRIORITY_OPTIONS: { value: RecommendationPriority; label: string; dotColor: string }[] = [
  { value: 'high', label: '불량', dotColor: 'bg-red-500' },
  { value: 'medium', label: '주의', dotColor: 'bg-yellow-500' },
  { value: 'low', label: '관심', dotColor: 'bg-gray-400' },
]

interface Props {
  serviceType: '정기딥케어' | '정기엔드케어'
  value: RecommendationState
  onChange: (state: RecommendationState) => void
}

export function RecommendServicePicker({ serviceType, value, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('전체')
  const [searchText, setSearchText] = useState('')
  const [customInput, setCustomInput] = useState('')

  const allItems = serviceType === '정기딥케어' ? DEEP_CARE_ITEMS : END_CARE_ITEMS

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesTab = activeTab === '전체' || item.category === activeTab
      const matchesSearch =
        searchText.trim() === '' ||
        item.name.toLowerCase().includes(searchText.trim().toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [allItems, activeTab, searchText])

  const toggleItem = (name: string) => {
    if (value[name]) {
      const next = { ...value }
      delete next[name]
      onChange(next)
    } else {
      onChange({ ...value, [name]: { reason: '', priority: 'medium' } })
    }
  }

  const updateItem = (
    name: string,
    patch: Partial<{ reason: string; priority: RecommendationPriority }>,
  ) => {
    if (!value[name]) return
    onChange({ ...value, [name]: { ...value[name], ...patch } })
  }

  const removeItem = (name: string) => {
    const next = { ...value }
    delete next[name]
    onChange(next)
  }

  const handleAddCustom = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    if (!value[trimmed]) {
      onChange({ ...value, [trimmed]: { reason: '', priority: 'medium' } })
    }
    setCustomInput('')
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCustom()
    }
  }

  const TABS: FilterTab[] = ['전체', '주방', '홀', '기타']

  return (
    <div className="flex flex-col gap-4">
      {/* 필터 탭 */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-brand-600 text-white'
                : 'bg-surface text-text-secondary border border-border'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 검색창 */}
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="항목 검색..."
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-600"
      />

      {/* 체크박스 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        {filteredItems.map((item) => {
          const selected = !!value[item.name]
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => toggleItem(item.name)}
              className={`px-2 py-2 rounded-lg border text-xs font-medium text-left transition-colors leading-snug break-keep ${
                selected
                  ? 'bg-brand-50 border-brand-600 text-brand-700'
                  : 'bg-surface border-border text-text-secondary'
              }`}
            >
              <span className="mr-1">{selected ? '✓' : '+'}</span>
              {item.name}
            </button>
          )
        })}
        {filteredItems.length === 0 && (
          <p className="col-span-3 text-sm text-text-tertiary text-center py-4">
            검색 결과가 없습니다.
          </p>
        )}
      </div>

      {/* 직접 입력 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={handleCustomKeyDown}
          placeholder="직접 입력 (Enter 또는 추가 버튼)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-600"
        />
        <button
          type="button"
          onClick={handleAddCustom}
          className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shrink-0"
        >
          추가
        </button>
      </div>

      {/* 선택된 항목들 */}
      {Object.keys(value).length > 0 && (
        <div className="flex flex-col gap-3 pt-2 border-t border-border-subtle">
          <p className="text-xs font-semibold text-text-secondary">
            선택된 항목 ({Object.keys(value).length}개)
          </p>
          {Object.entries(value).map(([name, item]) => (
            <div
              key={name}
              className="rounded-2xl border border-border-subtle bg-surface shadow-soft p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">{name}</span>
                <button
                  type="button"
                  onClick={() => removeItem(name)}
                  className="text-xs text-text-tertiary hover:text-red-600 transition-colors"
                >
                  제거
                </button>
              </div>

              {/* 우선순위 */}
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map((opt) => {
                  const isActive = item.priority === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateItem(name, { priority: opt.value })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        isActive
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-border bg-surface text-text-secondary'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* 이유 입력 */}
              <textarea
                value={item.reason}
                onChange={(e) => updateItem(name, { reason: e.target.value })}
                placeholder="추천 이유를 간단히 적어주세요 (예: 바닥에 묵은 때가 누적되어 있음)"
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-600 resize-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
