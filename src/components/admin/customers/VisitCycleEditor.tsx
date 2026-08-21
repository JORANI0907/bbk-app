'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import type { VisitCycleUnit, VisitCycleConfig } from '@/lib/schedule-generator'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

// 실사용 옵션 (분기/연간은 실무 사용 사례 없어 제거; 필요 시 월간 매 3/12개월마다로 대체)
const UNIT_OPTIONS: { key: VisitCycleUnit; label: string }[] = [
  { key: 'day',   label: '매일' },
  { key: 'week',  label: '주간' },
  { key: 'month', label: '월간' },
]

interface Props {
  unit:       VisitCycleUnit | ''
  value:      number
  config:     VisitCycleConfig
  color?:     'blue' | 'purple'
  onChange:   (unit: VisitCycleUnit | '', value: number, config: VisitCycleConfig) => void
}

export function VisitCycleEditor({ unit, value, config, color = 'blue', onChange }: Props) {
  const active    = color === 'purple' ? 'bg-purple-600 text-white' : 'bg-brand-600 text-white'
  const ringColor = color === 'purple' ? 'focus:ring-purple-400' : 'focus:ring-brand-400'
  const textColor = color === 'purple' ? 'text-purple-700' : 'text-brand-700'

  const [showHelp, setShowHelp] = useState(false)

  const setUnit  = (u: VisitCycleUnit) => onChange(u, value, {})
  const setValue = (v: number)          => onChange(unit as VisitCycleUnit, v, config)
  const setConfig = (c: VisitCycleConfig) => onChange(unit as VisitCycleUnit, value, c)

  const toggleWeekday = (day: number) => {
    const prev = config.weekdays ?? []
    setConfig({ ...config, weekdays: prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day] })
  }
  const toggleDate = (date: number) => {
    const prev = config.dates ?? []
    setConfig({ ...config, dates: prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date] })
  }

  const previewLabel = buildPreviewLabel(unit as VisitCycleUnit, value, config)

  return (
    <div className="flex flex-col gap-2.5">
      {/* 헤더: 타이틀 + 사용법 안내 토글 */}
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold text-text-primary">방문 일정</p>
        <button
          type="button"
          onClick={() => setShowHelp(v => !v)}
          className="text-text-tertiary hover:text-text-primary transition-colors"
          title="사용법 보기"
        >
          <Info size={13} />
        </button>
      </div>

      {/* 사용법 안내 (Info 아이콘 클릭 시 펼침) */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 space-y-2 text-xs text-blue-900 leading-relaxed">
          <p className="font-semibold text-blue-800">방문 일정 사용법</p>

          <div className="space-y-1">
            <p><span className="font-semibold">① 주기 단위 선택</span> — 매일 / 주간 / 월간 중 하나</p>
            <p><span className="font-semibold">② 반복 간격 설정</span> — &quot;매 N __마다&quot; 입력</p>
            <ul className="pl-4 list-disc space-y-0.5 text-blue-700">
              <li>매 1개월마다 = 매월</li>
              <li>매 2주마다 = 격주</li>
              <li>매 3개월마다 = 3개월 간격 (분기)</li>
              <li>매 12개월마다 = 매년</li>
            </ul>
            <p><span className="font-semibold">③ 세부 옵션</span></p>
            <ul className="pl-4 list-disc space-y-0.5 text-blue-700">
              <li>주간: 방문 요일 선택 (여러 개 가능)</li>
              <li>월간: 방문 날짜 선택 (여러 개 가능)</li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 text-amber-900">
            <p className="font-semibold mb-0.5">⚠️ 중요 — 계약 시작 월 기준</p>
            <p className="text-amber-800">
              &quot;매 N개월마다&quot;는 <strong>계약 시작 월부터 N개월 간격</strong>으로 방문 예정을 만듭니다.
            </p>
            <ul className="pl-4 list-disc mt-1 space-y-0.5 text-amber-800">
              <li>8월 계약 + 매 3개월마다 → 8, 11, 2, 5월 방문</li>
              <li>1월 계약 + 매 3개월마다 → 1, 4, 7, 10월 방문</li>
            </ul>
          </div>

          <div className="pt-1 border-t border-blue-100">
            <p className="font-semibold">④ 하단 버튼</p>
            <ul className="pl-4 list-disc space-y-0.5 text-blue-700">
              <li><strong>수정 반영</strong>: 기존 일정 갱신</li>
              <li><strong>생성</strong>: 신규 일정 생성</li>
            </ul>
          </div>
        </div>
      )}

      {/* 주기 단위 선택 */}
      <div className="flex gap-1">
        {UNIT_OPTIONS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setUnit(key)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${unit === key ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 매 N단위 설정 — day(매일), week(격주 등), month(격월) */}
      {(unit === 'day' || unit === 'week' || unit === 'month') && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary shrink-0">매</span>
          <input
            type="number" min={1} max={99}
            value={value}
            onChange={e => setValue(Math.max(1, parseInt(e.target.value) || 1))}
            className={`w-16 border border-border rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 ${ringColor}`}
          />
          <span className="text-xs text-text-secondary shrink-0">
            {{ day: '일마다', week: '주마다', month: '개월마다' }[unit]}
          </span>
        </div>
      )}

      {/* 요일 선택 (week) */}
      {unit === 'week' && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, wd) => (
            <button key={wd} type="button" onClick={() => toggleWeekday(wd)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                (config.weekdays ?? []).includes(wd) ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 날짜 선택 (month) */}
      {unit === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
            <button key={d} type="button" onClick={() => toggleDate(d)}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                (config.dates ?? []).includes(d) ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {d}
            </button>
          ))}
        </div>
      )}

      {/* 미리보기 */}
      {previewLabel && (
        <p className={`text-xs ${textColor} bg-gray-50 rounded-md px-2.5 py-1.5`}>{previewLabel}</p>
      )}
    </div>
  )
}

function buildPreviewLabel(unit: VisitCycleUnit, value: number, config: VisitCycleConfig): string {
  if (!unit) return ''
  const weekdays = config.weekdays ?? []
  const dates    = config.dates ?? []
  const wdLabels = WEEKDAY_LABELS

  if (unit === 'day') return value === 1 ? '매일 방문' : `매 ${value}일마다 방문`
  if (unit === 'week') {
    const wdText = weekdays.length > 0 ? weekdays.map(w => wdLabels[w]).join('·') + '요일' : '요일 미선택'
    return value === 1 ? `매주 ${wdText} 방문` : `매 ${value}주마다 ${wdText} 방문`
  }
  if (unit === 'month') {
    const dText = dates.length > 0 ? dates.sort((a,b)=>a-b).join('·') + '일' : '날짜 미선택'
    return value === 1 ? `매월 ${dText} 방문` : `매 ${value}개월마다 ${dText} 방문`
  }
  return ''
}
