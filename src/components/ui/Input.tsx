'use client'

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

// native input의 size 속성(number, 가시 너비)을 디자인 토큰 size로 대체
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

/**
 * 표준 입력 필드.
 * - 라벨/힌트/에러 메시지 통합
 * - 좌/우 아이콘 슬롯
 * - 시멘틱 토큰만 사용 (text-text-*, border-*)
 *
 * 사용:
 *   <Input label="전화번호" type="tel" placeholder="010-0000-0000" />
 *   <Input label="이메일" error="형식이 올바르지 않습니다" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leadingIcon,
    trailingIcon,
    size = 'md',
    fullWidth = true,
    className = '',
    id,
    ...props
  },
  ref,
) {
  const sizeStyles = {
    sm: 'h-9 text-sm px-3',
    md: 'h-10 text-sm px-3.5',
    lg: 'h-12 text-base px-4',
  }

  const reactId = (props.name ?? label ?? 'input').replace(/\s+/g, '-')
  const inputId = id ?? `bbk-input-${reactId}`

  const hasLeading = !!leadingIcon
  const hasTrailing = !!trailingIcon

  return (
    <div className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {hasLeading && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-text-tertiary pointer-events-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${inputId}-msg` : undefined}
          className={`
            block w-full rounded-md bg-surface
            border ${error ? 'border-state-danger' : 'border-border'}
            text-text-primary placeholder:text-text-tertiary
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${error ? 'focus:ring-state-danger/30 focus:border-state-danger'
                    : 'focus:ring-brand-500/30 focus:border-brand-500'}
            disabled:bg-surface-sunken disabled:text-text-tertiary disabled:cursor-not-allowed
            ${sizeStyles[size]}
            ${hasLeading ? 'pl-10' : ''}
            ${hasTrailing ? 'pr-10' : ''}
            ${className}
          `}
          {...props}
        />
        {hasTrailing && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-tertiary pointer-events-none">
            {trailingIcon}
          </span>
        )}
      </div>
      {(error || hint) && (
        <p
          id={`${inputId}-msg`}
          className={`mt-1.5 text-xs ${error ? 'text-state-danger' : 'text-text-tertiary'}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
})
