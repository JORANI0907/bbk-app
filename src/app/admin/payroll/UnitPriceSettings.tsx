'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Banknote, Save } from 'lucide-react'
import { getPrevMonth } from './utils'
import type { UnitPriceApp } from './types'

interface CustomerGroup {
  business_name: string
  service_type: string
  applicationIds: string[]
  first_app_id: string
}

export default function UnitPriceSettings({ month }: { month: string }) {
  const [apps, setApps] = useState<UnitPriceApp[]>([])
  const [monthlyPrices, setMonthlyPrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [carryingOver, setCarryingOver] = useState(false)
  const [monthEdits, setMonthEdits] = useState<Record<string, string>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | '정기딥케어' | '정기엔드케어'>('all')

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const loadData = useCallback(async () => {
    setLoading(true)
    setMonthEdits({})
    try {
      const res = await fetch(`/api/admin/unit-price-monthly/apps?month=${month}`).then(r => r.json())

      const list: UnitPriceApp[] = res.applications ?? []
      setApps(list)

      const priceMap = new Map<string, number>()
      for (const p of (res.prices ?? [])) {
        priceMap.set(p.application_id, p.unit_price)
      }

      // 이번 달 데이터가 없으면 전달에서 자동 이관
      if ((res.prices ?? []).length === 0 && list.length > 0) {
        const prevMonth = getPrevMonth(month)
        const prevRes = await fetch(`/api/admin/unit-price-monthly?month=${prevMonth}`).then(r => r.json())
        if ((prevRes.prices ?? []).length > 0) {
          setCarryingOver(true)
          const carryRes = await fetch('/api/admin/unit-price-monthly', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, from_month: prevMonth }),
          }).then(r => r.json())

          if ((carryRes.inserted ?? 0) > 0) {
            const newPricesRes = await fetch(`/api/admin/unit-price-monthly/apps?month=${month}`).then(r => r.json())
            for (const p of (newPricesRes.prices ?? [])) {
              priceMap.set(p.application_id, p.unit_price)
            }
            const prevLabel = prevMonth.replace('-', '년 ') + '월'
            toast.success(`${prevLabel} 단가 자동 이관 완료 (${carryRes.inserted}건)`)
          }
          setCarryingOver(false)
        }
      }

      setMonthlyPrices(priceMap)
    } catch {
      toast.error('데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { loadData() }, [loadData])

  const groups: CustomerGroup[] = (() => {
    const map = new Map<string, CustomerGroup>()
    for (const app of apps) {
      const existing = map.get(app.business_name)
      if (existing) {
        existing.applicationIds.push(app.id)
      } else {
        map.set(app.business_name, {
          business_name: app.business_name,
          service_type: app.service_type,
          applicationIds: [app.id],
          first_app_id: app.id,
        })
      }
    }
    return Array.from(map.values())
  })()

  // 현재 월별 가격 (편집 중인 값 우선 → DB 값)
  const getMonthPrice = (group: CustomerGroup): string => {
    const editVal = monthEdits[group.business_name]
    if (editVal !== undefined) return editVal
    const monthly = monthlyPrices.get(group.first_app_id)
    return monthly !== undefined ? String(monthly) : ''
  }

  const handleSaveAll = async () => {
    const monthChangedGroups = groups.filter(g => monthEdits[g.business_name] !== undefined)

    if (monthChangedGroups.length === 0) {
      toast('변경사항이 없습니다.', { icon: 'ℹ️' })
      return
    }

    setSavingAll(true)
    try {
      const monthTasks: Promise<unknown>[] = []
      for (const g of monthChangedGroups) {
        const val = monthEdits[g.business_name]
        const unitPrice = val === '' ? 0 : Number(val)
        if (!Number.isFinite(unitPrice)) {
          throw new Error(`${g.business_name}의 단가가 유효하지 않은 값입니다: "${val}"`)
        }
        for (const appId of g.applicationIds) {
          monthTasks.push(
            fetch('/api/admin/unit-price-monthly', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ application_id: appId, year_month: month, unit_price: unitPrice }),
            }).then(r => r.json()).then(d => {
              if (d.error) throw new Error(`단가 저장 실패: ${d.error}`)
            })
          )
        }
      }

      await Promise.all(monthTasks)
      toast.success(`저장 완료: ${monthChangedGroups.length}건 (급여정산 자동 반영)`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 중 오류')
    } finally {
      setSavingAll(false)
    }
  }

  const filtered = groups.filter(g => {
    if (typeFilter !== 'all' && g.service_type !== typeFilter) return false
    if (search && !g.business_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeCounts = {
    all: groups.length,
    '정기딥케어': groups.filter(g => g.service_type === '정기딥케어').length,
    '정기엔드케어': groups.filter(g => g.service_type === '정기엔드케어').length,
  }

  const hasChanges = Object.keys(monthEdits).length > 0

  if (loading || carryingOver) {
    return (
      <div className="text-center py-12 text-sm text-text-tertiary">
        {carryingOver ? '이전달 단가 이관 중...' : '불러오는 중...'}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 px-1">
        <p className="text-xs text-text-secondary mb-1">
          <span className="font-semibold text-brand-600">{displayMonth}</span> 방문당 단가
        </p>
        <p className="text-xs text-text-tertiary mb-2">
          이번 달 급여정산에 적용됩니다. 전월 단가는 자동 이관됩니다.
        </p>

        {/* 서비스 유형 필터 */}
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {([
            { key: 'all', label: '전체' },
            { key: '정기딥케어', label: '정기딥케어' },
            { key: '정기엔드케어', label: '정기엔드케어' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === key
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface border border-border text-text-secondary hover:border-blue-400'
              }`}
            >
              {label}
              <span className={`ml-1 ${typeFilter === key ? 'text-white/80' : 'text-text-tertiary'}`}>
                {typeCounts[key]}
              </span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="업체명 검색..."
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 저장 버튼 */}
      <div className="flex gap-2 mb-3 sticky top-0 bg-surface-sunken py-2 px-1 z-10 rounded-lg">
        <button
          onClick={handleSaveAll}
          disabled={!hasChanges || savingAll}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {savingAll ? '저장 중...' : hasChanges ? `전체 저장 (변경 ${Object.keys(monthEdits).length})` : '전체 저장'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-2"><Banknote size={32} /></div>
          <p className="text-sm text-text-tertiary">정기 서비스 계약이 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(group => {
            const isMonthly = monthlyPrices.has(group.first_app_id)
            const monthChanged = monthEdits[group.business_name] !== undefined
            return (
              <div key={group.business_name} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <p className="text-sm font-semibold text-text-primary truncate flex-1 min-w-0">{group.business_name}</p>
                  <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full whitespace-nowrap">{group.service_type}</span>
                  <span className="text-xs text-text-tertiary whitespace-nowrap">{group.applicationIds.length}건</span>
                  {isMonthly && !monthChanged && (
                    <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">이달 설정</span>
                  )}
                  {monthChanged && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">변경됨</span>
                  )}
                </div>

                <div>
                  <label className="text-[10px] text-orange-600 mb-0.5 block">방문당 단가</label>
                  <input
                    type="number"
                    value={getMonthPrice(group)}
                    onChange={e => setMonthEdits(prev => ({ ...prev, [group.business_name]: e.target.value }))}
                    placeholder="0"
                    className={`w-full px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      monthChanged ? 'border-blue-400 bg-blue-50' : 'border-border'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
