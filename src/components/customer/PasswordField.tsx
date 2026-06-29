'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  password: string
}

export function PasswordField({ password }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-tertiary w-20 shrink-0 pt-0.5">비밀번호</span>
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-text-primary font-medium font-mono tracking-wider">
          {visible ? password : '••••••••'}
        </span>
        <button
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
          className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}
