'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Banknote, Save, ArrowDownToLine } from 'lucide-react'
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
  // 두 종류의 로컬 편집 — 기본 단가 / 월별 단가
  const [baseEdits, setBaseEdits] = useState<Record<string, string>>({})
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
    setBaseEdits({})
    setMonthEdits({})
    try {
      // 전용 API로 정기 계약 전체 로딩 (기존 /applications?limit=200 은 200건 잘려 누락 발생)
      const res = await fetch(`/api/admin/unit-price-monthly/apps?month=${month}`).then(r => r.json())

      const list: UnitPriceApp[] = res.applications ?? []
      setApps(list)

      const priceMap = new Map<string, number>()
      for (const p of (res.prices ?? [])) {
        priceMap.set(p.application_id, p.unit_price)
      }

      // 이번 달 데이터가 없으면 전달에서 자동 이관 (기존 동작 유지)
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

  // 그룹핑: 같은 업체의 여러 신청서를 하나로 묶음.
  // 기본단가는 DB에 저장된 그대로 사용 — 자동 매핑/최댓값 채택 없음.
  // 사용자가 저장하면 그룹의 모든 신청서에 동일 값 반영되므로 이후 값이 흩어지지 않음.
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

  // 현재 월별 가격 (편집 중인 값 우선 → DB 값)
  const getMonthPrice = (group: CustomerGroup): string => {
    const editVal = monthEdits[group.business_name]
    if (editVal !== undefined) return editVal
    const monthly = monthlyPrices.get(group.first_app_id)
    return monthly !== undefined ? String(monthly) : ''
  }

  // 현재 기본 가격 (편집 중인 값 우선 → 원본)
  const getBasePrice = (group: CustomerGroup): string => {
    const editVal = baseEdits[group.business_name]
    if (editVal !== undefined) return editVal
    return group.base_unit_price !== null ? String(group.base_unit_price) : ''
  }

  // 기본 단가 → 이번 달 일괄 이관 (로컬만, 저장은 별도)
  const handleCarryBaseToMonth = () => {
    const newMonthEdits: Record<string, string> = { ...monthEdits }
    groups.forEach(g => {
      const baseStr = getBasePrice(g)
      newMonthEdits[g.business_name] = baseStr
    })
    setMonthEdits(newMonthEdits)
    toast.success('기본 단가가 이번 달 칸에 채워졌습니다. [전체 저장]을 눌러 반영하세요.')
  }

  // ─── 기본단가 저장 (왼쪽 필드만) ───────────────────────────
  // 년월 무관 고정값. 어디서도 자동 매핑 안 함. 저장한 그대로 유지.
  const handleSaveBase = async () => {
    const baseChangedGroups = groups.filter(g => baseEdits[g.business_name] !== undefined)

    if (baseChangedGroups.length === 0) {
      toast('기본단가 변경사항이 없습니다.', { icon: 'ℹ️' })
      return
    }

    // 안전 장치: 값 있던 것을 빈 값/0으로 지우면 명시적 확인
    const baseClearingGroups = baseChangedGroups.filter(g => {
      const editVal = baseEdits[g.business_name]
      const hadValue = g.base_unit_price !== null
      return hadValue && (editVal === '' || editVal === '0')
    })
    if (baseClearingGroups.length > 0) {
      const names = baseClearingGroups.slice(0, 5).map(g => `• ${g.business_name}`).join('\n')
      const more = baseClearingGroups.length > 5 ? `\n...외 ${baseClearingGroups.length - 5}건` : ''
      const ok = confirm(
        `⚠️ 기본단가를 삭제(빈 값)하려는 항목이 ${baseClearingGroups.length}건 있습니다.\n\n${names}${more}\n\n` +
        `기본단가는 영구 저장값입니다.\n정말 삭제할까요?\n\n(취소하면 저장을 중단합니다)`
      )
      if (!ok) return
    }

    setSavingAll(true)
    try {
      const tasks: Promise<unknown>[] = []
      for (const g of baseChangedGroups) {
        const editVal = baseEdits[g.business_name]
        const newBase = editVal === '' ? null : Number(editVal)
        if (newBase !== null && !Number.isFinite(newBase)) {
          throw new Error(`${g.business_name}의 기본단가가 유효하지 않은 값입니다: "${editVal}"`)
        }
        for (const appId of g.applicationIds) {
          tasks.push(
            fetch('/api/admin/applications', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: appId, unit_price_per_visit: newBase }),
            }).then(r => r.json()).then(d => {
              if (d.error) throw new Error(`기본단가 저장 실패: ${d.error}`)
            })
          )
        }
      }
      await Promise.all(tasks)
      toast.success(`기본단가 저장 완료 (${baseChangedGroups.length}건, 년월 무관 고정)`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 중 오류')
    } finally {
      setSavingAll(false)
    }
  }

  // ─── 이번달 단가 적용 (오른쪽 필드만) ─────────────────────
  // 해당 월(unit_price_monthly)만 저장. 기본단가는 안 건드림.
  const handleSaveMonth = async () => {
    const monthChangedGroups = groups.filter(g => monthEdits[g.business_name] !== undefined)

    if (monthChangedGroups.length === 0) {
      toast('이번달 단가 변경사항이 없습니다.', { icon: 'ℹ️' })
      return
    }

    setSavingAll(true)
    try {
      const tasks: Promise<unknown>[] = []
      for (const g of monthChangedGroups) {
        const val = monthEdits[g.business_name]
        const unitPrice = val === '' ? 0 : Number(val)
        if (!Number.isFinite(unitPrice)) {
          throw new Error(`${g.business_name}의 이번달 단가가 유효하지 않은 값입니다: "${val}"`)
        }
        for (const appId of g.applicationIds) {
          tasks.push(
            fetch('/api/admin/unit-price-monthly', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ application_id: appId, year_month: month, unit_price: unitPrice }),
            }).then(r => r.json()).then(d => {
              if (d.error) throw new Error(`이번달 단가 저장 실패: ${d.error}`)
            })
          )
        }
      }
      await Promise.all(tasks)
      toast.success(`${displayMonth} 단가 적용 완료 (${monthChangedGroups.length}건)`)
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

  const hasBaseChanges = Object.keys(baseEdits).length > 0
  const hasMonthChanges = Object.keys(monthEdits).length > 0

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
          <span className="font-semibold text-brand-600">{displayMonth}</span> 방문당 단가 설정
        </p>
        <p className="text-xs text-text-tertiary mb-2">
          <b>기본단가</b>는 년월 무관 고정값 · <b>이번달 단가</b>는 해당 월 급여정산에 적용
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

      {/* 액션 버튼 3개: 기본단가 저장 · 이관 · 이번달 단가 적용 */}
      <div className="flex gap-2 mb-3 sticky top-0 bg-surface-sunken py-2 px-1 z-10 rounded-lg">
        <button
          onClick={handleSaveBase}
          disabled={!hasBaseChanges || savingAll}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold bg-slate-700 text-white hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="왼쪽 기본단가만 저장 (년월 무관 고정)"
        >
          <Save size={14} />
          {savingAll ? '저장 중...' : hasBaseChanges ? `기본단가 저장 (${Object.keys(baseEdits).length})` : '기본단가 저장'}
        </button>
        <button
          onClick={handleCarryBaseToMonth}
          disabled={groups.length === 0 || savingAll}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50"
          title="기본단가 값을 이번달 단가 칸에 복사 (DB 저장 아님, 로컬 복사만)"
        >
          <ArrowDownToLine size={14} />
          이관
        </button>
        <button
          onClick={handleSaveMonth}
          disabled={!hasMonthChanges || savingAll}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="오른쪽 이번달 단가만 저장 (해당 월 급여정산에 적용)"
        >
          <Save size={14} />
          {savingAll ? '저장 중...' : hasMonthChanges ? `이번달 단가 적용 (${Object.keys(monthEdits).length})` : '이번달 단가 적용'}
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
            const baseChanged = baseEdits[group.business_name] !== undefined
            const monthChanged = monthEdits[group.business_name] !== undefined
            return (
              <div key={group.business_name} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-3">
                {/* 헤더: 업체명 + 배지 */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <p className="text-sm font-semibold text-text-primary truncate flex-1 min-w-0">{group.business_name}</p>
                  <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full whitespace-nowrap">{group.service_type}</span>
                  <span className="text-xs text-text-tertiary whitespace-nowrap">{group.applicationIds.length}건</span>
                  {isMonthly && !monthChanged && (
                    <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">이달 설정</span>
                  )}
                  {(baseChanged || monthChanged) && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">변경됨</span>
                  )}
                </div>

                {/* 두 input: 기본 단가 / 이번 달 단가 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-text-tertiary mb-0.5 block">기본 단가 (영구)</label>
                    <input
                      type="number"
                      value={getBasePrice(group)}
                      onChange={e => setBaseEdits(prev => ({ ...prev, [group.business_name]: e.target.value }))}
                      placeholder="0"
                      className={`w-full px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        baseChanged ? 'border-blue-400 bg-blue-50' : 'border-border'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-orange-600 mb-0.5 block">이번 달 단가</label>
                    <input
                      type="number"
                      value={getMonthPrice(group)}
                      onChange={e => setMonthEdits(prev => ({ ...prev, [group.business_name]: e.target.value }))}
                      placeholder="기본 단가 사용"
                      className={`w-full px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        monthChanged ? 'border-blue-400 bg-blue-50' : 'border-border'
                      }`}
                    />
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
