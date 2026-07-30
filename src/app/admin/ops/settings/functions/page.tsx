'use client'

/**
 * 기능(functions) 설정 페이지
 * PLAN v2 §3.6
 *
 * 15개 시드 기능 · 담당(owner) + 백업(backup) 사용자 배정
 * 라이브 PATCH (드롭다운 변경 즉시 저장)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Users } from 'lucide-react'

interface FunctionRow {
  code: string
  kind: string
  name: string
  owner_user_id: string | null
  backup_user_id: string | null
  sort_order: number
}

interface UserRow {
  id: string
  name: string
  role: string
}

export default function FunctionsSettingsPage() {
  const [functions, setFunctions] = useState<FunctionRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [funcRes, userRes] = await Promise.all([
        fetch('/api/admin/ops/settings/functions').then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json()),
      ])
      if (funcRes.ok) setFunctions(funcRes.functions)
      setUsers((userRes.users ?? []).filter((u: UserRow) => u.role === 'admin' || u.role === 'worker'))
    } catch { toast.error('로드 실패') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const patchOne = async (code: string, patch: { owner_user_id?: string | null; backup_user_id?: string | null }) => {
    try {
      const res = await fetch('/api/admin/ops/settings/functions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...patch }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? '실패')
      setFunctions(prev => prev.map(f => f.code === code ? { ...f, ...patch } : f))
    } catch (e) { toast.error((e as Error).message) }
  }

  const options = users.map(u => ({ id: u.id, label: `${u.name} (${u.role === 'admin' ? '관리자' : '직원'})` }))

  if (loading) return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><Users size={20} /> 기능 담당 설정</h1>
      </div>
      <p className="text-xs text-text-tertiary">각 기능마다 담당자와 백업 담당자를 지정합니다. 결원 시 백업이 자동 대체.</p>

      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
        {functions.map(f => (
          <div key={f.code} className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div>
              <p className="text-sm font-semibold text-text-primary">{f.name}</p>
              <p className="text-xs text-text-tertiary">{f.code} · {f.kind}</p>
            </div>
            <select
              value={f.owner_user_id ?? ''}
              onChange={e => patchOne(f.code, { owner_user_id: e.target.value || null })}
              className="input-toss w-full px-2 py-1.5 rounded-md border border-border bg-surface text-sm"
            >
              <option value="">담당자 미배정</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <select
              value={f.backup_user_id ?? ''}
              onChange={e => patchOne(f.code, { backup_user_id: e.target.value || null })}
              className="input-toss w-full px-2 py-1.5 rounded-md border border-border bg-surface text-sm"
            >
              <option value="">백업 미배정</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
