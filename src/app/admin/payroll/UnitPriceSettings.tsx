'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Banknote, Pencil } from 'lucide-react'
import { Button } from '@/components/ui'
import { getPrevMonth } from './utils'
import type { UnitPriceApp } from './types'

interface CustomerGroup {
  business_name: string
  service_type: string
  applicationIds: string[]
  base_unit_price: number | null
  first_app_id: string
}

export default function UnitPriceSettings({ month }: { month: string }) {
  const [apps, setApps] = useState<UnitPriceApp[]>([])
  const [monthlyPrices, setMonthlyPrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [carryingOver, setCarryingOver] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const loadData = useCallback(async () => {
    setLoading(true)
    setEdits({})
    try {
      const [appsRes, pricesRes] = await Promise.all([
        fetch('/api/admin/applications?limit=200').then(r => r.json()),
        fetch(`/api/admin/unit-price-monthly?month=${month}`).then(r => r.json()),
      ])

      const list: UnitPriceApp[] = (appsRes.applications ?? []).filter(
        (a: UnitPriceApp) => a.service_type === '정기딥케어' || a.service_type === '정기엔드케어'
      )
      setApps(list)

      const priceMap = new Map<string, number>()
      for (const p of (pricesRes.prices ?? [])) {
        priceMap.set(p.application_id, p.unit_price)
      }

      // 이번 달 데이터가 없으면 전달에서 자동 이관
      if ((pricesRes.prices ?? []).length === 0 && list.length > 0) {
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
            const newPricesRes = await fetch(`/api/admin/unit-price-monthly?month=${month}`).then(r => r.json())
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
          base_unit_price: app.unit_price_per_visit,
          first_app_id: app.id,
        })
      }
    }
    return Array.from(map.values())
  })()

  const getGroupPrice = (group: CustomerGroup): { price: number | null; isMonthly: boolean } => {
    const monthly = monthlyPrices.get(group.first_app_id)
    if (monthly !== undefined) return { price: monthly || null, isMonthly: true }
    return { price: group.base_unit_price, isMonthly: false }
  }

  const handleSave = async (group: CustomerGroup) => {
    const val = edits[group.business_name]
    if (val === undefined) return
    setSaving(group.business_name)
    try {
      const unitPrice = val === '' ? 0 : Number(val)
      await Promise.all(
        group.applicationIds.map(appId =>
          fetch('/api/admin/unit-price-monthly', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: appId, year_month: month, unit_price: unitPrice }),
          }).then(r => r.json()).then(d => {
            if (d.error) throw new Error(d.error)
          })
        )
      )
      setMonthlyPrices(prev => {
        const next = new Map(prev)
        group.applicationIds.forEach(id => next.set(id, unitPrice))
        return next
      })
      setEdits(prev => { const n = { ...prev }; delete n[group.business_name]; return n })
      toast.success('단가 저장됨')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  const filtered = groups.filter(g =>
    !search || g.business_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading || carryingOver) {
    return (
      <div className="text-center py-12 text-sm text-text-tertiary">
        {carryingOver ? '이전달 단가 이관 중...' : '불러오는 중...'}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 px-1">
        <p className="text-xs text-text-secondary mb-1">
          <span className="font-semibold text-brand-600">{displayMonth}</span> 방문당 단가 설정
        </p>
        <p className="text-xs text-text-tertiary mb-3">
          이전달 단가가 자동 이관됩니다. 변경이 필요한 항목만 수정하세요.
        </p>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="업체명 검색..."
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-2"><Banknote size={32} /></div>
          <p className="text-sm text-text-tertiary">정기 서비스 계약이 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(group => {
            const editVal = edits[group.business_name]
            const isEditing = editVal !== undefined
            const { price, isMonthly } = getGroupPrice(group)
            return (
              <div key={group.business_name} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{group.business_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{group.service_type}</span>
                      <span className="text-xs text-text-tertiary">{group.applicationIds.length}건</span>
                      {isMonthly && (
                        <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">이달 설정</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          value={editVal}
                          onChange={e => setEdits(prev => ({ ...prev, [group.business_name]: e.target.value }))}
                          className="w-28 px-2 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="금액"
                          autoFocus
                        />
                        <Button
                          onClick={() => handleSave(group)}
                          disabled={saving === group.business_name}
                          size="sm"
                        >
                          {saving === group.business_name ? '...' : '저장'}
                        </Button>
                        <button
                          onClick={() => setEdits(prev => { const n = { ...prev }; delete n[group.business_name]; return n })}
                          className="text-xs text-text-tertiary hover:text-text-secondary"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${price ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {price ? price.toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          {!isMonthly && price && (
                            <p className="text-xs text-text-tertiary">(기본단가)</p>
                          )}
                        </div>
                        <button
                          onClick={() => setEdits(prev => ({ ...prev, [group.business_name]: String(price ?? '') }))}
                          className="text-xs text-text-tertiary hover:text-brand-600 px-1"
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
