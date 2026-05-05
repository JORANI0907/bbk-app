'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function PasswordChangeForm() {
  const [show, setShow] = useState(false)
  const [value, setValue] = useState('')

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-tertiary w-20 shrink-0">비밀번호</span>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="비밀번호 입력"
        className="text-sm font-medium flex-1 bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="text-text-tertiary hover:text-brand-600 transition-colors p-1 -mr-1 shrink-0"
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
