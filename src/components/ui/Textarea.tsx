'use client'

import { TextareaHTMLAttributes, forwardRef, useEffect, useRef } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  autosize?: boolean
  fullWidth?: boolean
  showCount?: boolean
}

/**
 * 표준 멀티라인 입력 필드.
 * - autosize: 콘텐츠 길이에 맞춰 높이 자동 조정 (라이브러리 없이 순수 React)
 * - showCount: 우하단 글자수 표시 (maxLength와 함께 쓸 때 유용)
 *
 * 사용:
 *   <Textarea label="요청사항" autosize showCount maxLength={500} />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    hint,
    autosize = false,
    fullWidth = true,
    showCount = false,
    className = '',
    id,
    value,
    defaultValue,
    onChange,
    maxLength,
    ...props
  },
  ref,
) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null)

  const setRefs = (el: HTMLTextAreaElement | null) => {
    internalRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  useEffect(() => {
    if (!autosize) return
    const el = internalRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [autosize, value, defaultValue])

  const reactId = (props.name ?? label ?? 'textarea').replace(/\s+/g, '-')
  const textareaId = id ?? `bbk-textarea-${reactId}`

  const currentLength =
    typeof value === 'string'
      ? value.length
      : typeof defaultValue === 'string'
        ? defaultValue.length
        : 0

  return (
    <div className={fullWidth ? 'w-full' : 'inline-block'}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <textarea
          ref={setRefs}
          id={textareaId}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${textareaId}-msg` : undefined}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          onChange={(e) => {
            if (autosize) {
              e.currentTarget.style.height = 'auto'
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
            }
            onChange?.(e)
          }}
          className={`
            block w-full rounded-md bg-surface px-3.5 py-2.5
            border ${error ? 'border-state-danger' : 'border-border'}
            text-sm text-text-primary placeholder:text-text-tertiary
            transition-colors leading-normal
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${error ? 'focus:ring-state-danger/30 focus:border-state-danger'
                    : 'focus:ring-brand-500/30 focus:border-brand-500'}
            disabled:bg-surface-sunken disabled:text-text-tertiary disabled:cursor-not-allowed
            ${autosize ? 'resize-none overflow-hidden' : 'resize-y'}
            ${className}
          `}
          rows={props.rows ?? 4}
          {...props}
        />
        {showCount && maxLength && (
          <span className="absolute bottom-2 right-3 text-xs text-text-tertiary tabular-nums">
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
      {(error || hint) && (
        <p
          id={`${textareaId}-msg`}
          className={`mt-1.5 text-xs ${error ? 'text-state-danger' : 'text-text-tertiary'}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
})
