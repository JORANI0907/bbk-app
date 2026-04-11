'use client'

import { useState, useRef, useEffect } from 'react'

interface MonthNavigatorProps {
  value: string // 'YYYY-MM'
  onChange: (value: string) => void
  className?: string
}

export function MonthNavigator({ value, onChange, className = '' }: MonthNavigatorProps) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const [year, month] = value.split('-').map(Number)

  const prev = () => {
    const d = new Date(year, month - 2, 1)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const next = () => {
    const d = new Date(year, month, 1)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const displayYears = [year - 1, year, year + 1]

  return (
    <div className={`flex items-center gap-0.5 relative ${className}`}>
      <button
        onClick={prev}
        className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-800 font-medium"
      >
        ←
      </button>

      <button
        onClick={() => setShowPicker(v => !v)}
        className="min-w-[112px] text-center px-3 py-1.5 text-sm font-bold text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      >
        {year}. {String(month).padStart(2, '0')}
      </button>

      <button
        onClick={next}
        className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-800 font-medium"
      >
        →
      </button>

      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-64"
        >
          {displayYears.map(y => (
            <div key={y} className="mb-3 last:mb-0">
              <p className="text-xs font-semibold text-gray-400 mb-1.5 px-1">{y}년</p>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const val = `${y}-${String(m).padStart(2, '0')}`
                  const isSelected = val === value
                  return (
                    <button
                      key={m}
                      onClick={() => { onChange(val); setShowPicker(false) }}
                      className={`py-1.5 text-xs rounded-lg transition-colors font-medium ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {m}월
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
