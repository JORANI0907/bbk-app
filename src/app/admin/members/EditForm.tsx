'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { User, UserRole } from '@/types/database'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  worker: '직원',
  customer: '고객',
}

export interface EditFormData {
  name: string
  phone: string
  email: string
  new_password: string
}

interface Props {
  user: User
  form: EditFormData
  setForm: (updater: (prev: EditFormData) => EditFormData) => void
  saving: boolean
  onSubmit: () => void
  onClose: () => void
}

function currentPwHint(user: User): string {
  if (user.password_hint) return user.password_hint
  const phone = (user.phone ?? '').replace(/-/g, '')
  if (user.role === 'customer') return `사업자등록번호 (없으면 ${phone})`
  return `${phone}bbk`
}

export default function EditForm({ user, form, setForm, saving, onSubmit, onClose }: Props) {
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  return (
    <Card className="p-5 mb-4 border-amber-200 bg-amber-50">
      <h2 className="font-semibold text-text-primary mb-0.5">회원 수정</h2>
      <p className="text-xs text-text-secondary mb-4">{user.name} ({ROLE_LABELS[user.role]})</p>
      <div className="space-y-3">

        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">이름 *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="홍길동"
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-surface"
          />
          <p className="text-xs text-amber-700 mt-1">
            ⚠ 이름 또는 전화번호 변경 시 고객관리·직원관리 DB 연결이 끊어질 수 있습니다.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">전화번호 *</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="01012345678"
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-surface"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">이메일 (선택)</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="example@email.com"
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-surface"
          />
        </div>

        {/* 현재 비밀번호 */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">현재 비밀번호</label>
          <div className="relative">
            <input
              type={showCurrentPw ? 'text' : 'password'}
              readOnly
              value={currentPwHint(user)}
              className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm bg-surface-sunken text-text-secondary cursor-default select-none"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              {showCurrentPw ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            {user.role === 'customer' ? '고객 초기 PW: 사업자등록번호' : '직원/관리자 초기 PW: 전화번호+bbk'}
          </p>
        </div>

        {/* 새 비밀번호 */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">
            새 비밀번호 (선택 — 비워두면 변경 안 함)
          </label>
          <div className="relative">
            <input
              type={showNewPw ? 'text' : 'password'}
              value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
              placeholder="8자 이상 입력 시 변경"
              className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-surface"
            />
            <button
              type="button"
              onClick={() => setShowNewPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              {showNewPw ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={onSubmit} isLoading={saving} className="flex-1 bg-amber-500 hover:bg-amber-600">
            저장
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">취소</Button>
        </div>
      </div>
    </Card>
  )
}
