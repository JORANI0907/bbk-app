'use client'

import { SelectHTMLAttributes, forwardRef } from 'react'

// native select의 size 속성(number, 동시 표시 옵션 수)을 디자인 토큰 size로 대체
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

/**
 * 표준 select 입력. native 요소 래퍼라 가볍고 접근성 기본 보장.
 *
 * 사용:
 *   <Select label="역할" defaultValue="worker">
 *     <option value="admin">관리자</option>
 *     <option value="worker">작업자</option>
 *   </Select>
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    hint,
    size = 'md',
    fullWidth = true,
    className = '',
    id,
    children,
    ...props
  },
  ref,
) {
  const sizeStyles = {
    sm: 'h-9 text-sm pl-3 pr-9',
    md: 'h-10 text-sm pl-3.5 pr-10',
    lg: 'h-12 text-base pl-4 pr-11',
  }

  const reactId = (props.name ?? label ?? 'select').replace(/\s+/g, '-')
  const selectId = id ?? `bbk-select-${reactId}`

  return (
    <div className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${selectId}-msg` : undefined}
          className={`
            block w-full appearance-none rounded-md bg-surface
            border ${error ? 'border-state-danger' : 'border-border'}
            text-text-primary
            transition-colors cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${error ? 'focus:ring-state-danger/30 focus:border-state-danger'
                    : 'focus:ring-brand-500/30 focus:border-brand-500'}
            disabled:bg-surface-sunken disabled:text-text-tertiary disabled:cursor-not-allowed
            ${sizeStyles[size]}
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-tertiary pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {(error || hint) && (
        <p
          id={`${selectId}-msg`}
          className={`mt-1.5 text-xs ${error ? 'text-state-danger' : 'text-text-tertiary'}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
})
