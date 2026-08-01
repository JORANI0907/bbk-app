'use client'

import type { VisitCycleUnit, VisitCycleConfig } from '@/lib/schedule-generator'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const UNIT_OPTIONS: { key: VisitCycleUnit; label: string }[] = [
  { key: 'day',     label: '매일' },
  { key: 'week',    label: '주간' },
  { key: 'month',   label: '월간' },
  { key: 'quarter', label: '분기' },
  { key: 'year',    label: '연간' },
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

      {/* 분기 — 분기 내 몇 번째 달 + 날짜 */}
      {unit === 'quarter' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24 shrink-0">분기 내 달</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(offset => (
                <button key={offset} type="button"
                  onClick={() => setConfig({ ...config, month_offset: offset })}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    (config.month_offset ?? 0) === offset ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {['첫째 달', '둘째 달', '셋째 달'][offset]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24 shrink-0">방문 날짜</span>
            <input type="number" min={1} max={31}
              value={config.date ?? ''}
              onChange={e => setConfig({ ...config, date: parseInt(e.target.value) || 1 })}
              placeholder="1~31"
              className={`w-16 border border-border rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 ${ringColor}`} />
            <span className="text-xs text-text-secondary">일</span>
          </div>
        </div>
      )}

      {/* 연간 — 방문 월 + 날짜 */}
      {unit === 'year' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24 shrink-0">방문 월</span>
            <input type="number" min={1} max={12}
              value={config.month ?? ''}
              onChange={e => setConfig({ ...config, month: parseInt(e.target.value) || 1 })}
              placeholder="1~12"
              className={`w-16 border border-border rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 ${ringColor}`} />
            <span className="text-xs text-text-secondary">월</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24 shrink-0">방문 날짜</span>
            <input type="number" min={1} max={31}
              value={config.date ?? ''}
              onChange={e => setConfig({ ...config, date: parseInt(e.target.value) || 1 })}
              placeholder="1~31"
              className={`w-16 border border-border rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 ${ringColor}`} />
            <span className="text-xs text-text-secondary">일</span>
          </div>
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
  if (unit === 'quarter') {
    const offsetLabel = ['첫째 달', '둘째 달', '셋째 달'][config.month_offset ?? 0]
    return `매 분기 ${offsetLabel} ${config.date ?? '?'}일 방문`
  }
  if (unit === 'year') {
    return `매년 ${config.month ?? '?'}월 ${config.date ?? '?'}일 방문`
  }
  return ''
}
