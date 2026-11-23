'use client'

import { Input } from '@/components/ui'

interface NumberFieldProps {
  label?: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  suffix?: string
  hint?: string
  placeholder?: string
  size?: 'sm' | 'md'
  /** null 허용 (빈칸 = 미입력) */
  nullable?: boolean
}

/** 숫자 입력 — 빈칸은 nullable 이면 null, 아니면 0 */
export function NumberField({ label, value, onChange, step = 1, min = 0, suffix, hint, placeholder, size = 'md', nullable = false }: NumberFieldProps) {
  return (
    <Input
      label={label ? (suffix ? `${label} (${suffix})` : label) : undefined}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      size={size}
      value={value ?? ''}
      placeholder={placeholder}
      hint={hint}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') { onChange(nullable ? null : 0); return }
        const n = Number(raw)
        onChange(Number.isFinite(n) ? n : (nullable ? null : 0))
      }}
      fullWidth
    />
  )
}
