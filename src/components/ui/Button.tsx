'use client'

import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className = '',
  ...props
}: ButtonProps) {
  // primary는 브랜드 컬러 그림자와 살짝 뜨는 hover
  // 나머지는 일반 그림자 + press scale
  const interactionClass =
    variant === 'primary' ? 'btn-toss-primary' : 'btn-toss'

  const variantStyles = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white',
    secondary:
      'bg-surface border border-border hover:bg-surface-sunken text-text-primary',
    danger: 'bg-state-danger hover:bg-red-700 text-white',
    ghost: 'hover:bg-surface-sunken text-text-secondary',
  }

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      type="button"
      className={`${interactionClass} inline-flex items-center justify-center gap-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
      disabled={isLoading || props.disabled}
    >
      {isLoading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
