'use client'

/**
 * 비용 계산기 (관리자·직원) — 5단계: ① 서비스 ② 인원·시간·난이도 ③ 조건 ④ 결과 ⑤ 저장.
 *   - 인원과 1명당 시간은 견적자가 현장을 보고 직접 적는다 (규모 구간 없음, 2026-11-23).
 *   - 입력은 브라우저에 남아 화면을 오가도 유지된다 (서비스 유형별로 따로).
 *   - 결과는 저장할 수 있고 견적관리에서 불러올 수 있다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input, ScrollToTopButton, SectionHeader, Select, Spinner } from '@/components/ui'
import { NumberField } from '@/components/pricing/NumberField'
import { PriceBreakdown } from '@/components/pricing/PriceBreakdown'
import { PricingSection, SubGroup } from '@/components/pricing/PricingSection'
import { usePricingRules } from '@/components/pricing/usePricingRules'
import { calculatePrice, emptyInput } from '@/lib/pricing/calc'
import { useLocalDraft } from '@/lib/use-local-draft'
import { isRegular, SERVICE_TYPES, SERVICE_TYPE_LABELS, type CalcInput, type PricingServiceType } from '@/lib/pricing/types'

interface CalcDraft {
  type: PricingServiceType
  inputs: Partial<Record<PricingServiceType, CalcInput>>
  label: string
}

const EMPTY_DRAFT: CalcDraft = { type: 'onetime_deep', inputs: {}, label: '' }

export default function PricingCalculatorPage() {
  const router = useRouter()
  const { rules, isLoading } = usePricingRules()
  const { value: draft, update: setDraft, clear: clearDraft, restored } = useLocalDraft<CalcDraft>('bbk_pricing_calc_v3', EMPTY_DRAFT)
  const [isSaving, setIsSaving] = useState(false)

  const type = draft.type
  const rule = rules.find((r) => r.service_type === type) ?? null
  const cfg = rule?.config ?? null
  const input = draft.inputs[type] ?? null

  // 처음 들어오거나 저장본이 없는 유형이면 빈 입력으로 시작
  useEffect(() => {
    if (cfg && !input) setDraft((d) => ({ ...d, inputs: { ...d.inputs, [type]: emptyInput(type, cfg) } }))
  }, [cfg, input, type, setDraft])

  const result = useMemo(() => (cfg && input ? calculatePrice(cfg, input) : null), [cfg, input])
  const regular = isRegular(type)
  const set = (patch: Partial<CalcInput>) => setDraft((d) => ({ ...d, inputs: { ...d.inputs, [type]: { ...(d.inputs[type] as CalcInput), ...patch } } }))
  const setType = (t: PricingServiceType) => setDraft((d) => ({ ...d, type: t }))
  const setLabel = (label: string) => setDraft((d) => ({ ...d, label }))

  const toggleRule = (id: string) => {
    if (!input) return
    set({ disabled_rule_ids: input.disabled_rule_ids.includes(id) ? input.disabled_rule_ids.filter((x) => x !== id) : [...input.disabled_rule_ids, id] })
  }

  const handleReset = () => {
    if (!cfg) return
    setDraft((d) => ({ ...d, inputs: { ...d.inputs, [type]: emptyInput(type, cfg) } }))
  }

  const handleSave = async () => {
    if (!input || !result || !cfg) return
    setIsSaving(true)
    try {
      const meta = {
        difficulty_name: cfg.difficulty_grades.find((g) => g.id === input.difficulty_id)?.name ?? null,
        service_label: SERVICE_TYPE_LABELS[type],
      }
      const res = await fetch('/api/admin/pricing/calculations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_type: type, rule_id: rule?.id ?? null, inputs: { ...input, _meta: meta }, result, label: draft.label }),
      })
      const json = await res.json()
      if (json.success) toast.success('저장했습니다. 견적관리에서 "계산기 결과 불러오기"로 쓸 수 있습니다.')
      else toast.error(json.error ?? '저장에 실패했습니다.')
    } catch {
      toast.error('저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !cfg || !input || !result) return <div className="flex justify-center py-16"><Spinner /></div>

  const grade = cfg.difficulty_grades.find((g) => g.id === input.difficulty_id)
  const enabledRules = [...cfg.surcharges, ...cfg.discounts].filter((r) => r.enabled)

  return (
    <div className="space-y-6">
      <SectionHeader
        level="page"
        title="비용 계산기"
        subtitle="왼쪽을 위에서 아래로 채우면 오른쪽 금액이 바로 바뀝니다. 입력은 이 브라우저에 남아 있어 다른 화면을 보고 와도 그대로입니다."
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={handleReset}>이 서비스 입력 초기화</Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/pricing')}>기준값 수정</Button>
          </div>
        }
      />

      {restored && <p className="text-xs text-text-tertiary">이전에 작성하던 내용을 복원했습니다. 전부 지우려면 <button className="underline" onClick={clearDraft}>초기화</button>.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <PricingSection n={1} title="서비스 종류" hint={`${rule?.id ? `기준 제${rule.version_no}판` : '기준 기본값(미저장)'}으로 계산합니다.`}>
            <div className="inline-flex gap-1 bg-surface-sunken border border-border-subtle rounded-xl p-1 flex-wrap">
              {SERVICE_TYPES.map((t) => (
                <button key={t} onClick={() => setType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-brand-100 text-brand-800 shadow-soft' : 'text-text-secondary hover:text-text-primary hover:bg-surface'}`}>
                  {SERVICE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </PricingSection>

          <PricingSection n={2} title="인원·시간·난이도" hint="현장을 보고 몇 명이 각각 몇 시간 일할지 적습니다. 난이도를 고르면 그 계수만큼 1명당 시간이 늘어납니다.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumberField label="투입 인원" suffix="명" min={1} nullable placeholder="예: 2" value={input.workers} onChange={(v) => set({ workers: v })} />
              <NumberField label="1명당 시간" suffix="시/1인" step={0.5} nullable placeholder="예: 6" value={input.hours_per_worker} onChange={(v) => set({ hours_per_worker: v })} />
              <div className="col-span-2 md:col-span-1">
                <Select label="난이도" value={input.difficulty_id} onChange={(e) => set({ difficulty_id: e.target.value })} fullWidth>
                  {cfg.difficulty_grades.map((g) => <option key={g.id} value={g.id}>{g.name} · 시간 ×{g.time_factor}</option>)}
                </Select>
              </div>
            </div>
            <SubGroup title="이 난이도의 판단 기준" hint={grade?.criteria || '기준 없음'}>
              <p className="text-sm text-text-secondary break-keep">
                난이도 적용 후 1명당 <strong className="text-text-primary">{result.hours_per_worker}시간</strong> ·
                총 작업시간 {result.workers}명 × {result.hours_per_worker}시간 = <strong className="text-text-primary">{result.total_hours}시간</strong>
              </p>
            </SubGroup>
          </PricingSection>

          <PricingSection n={3} title="조건 (선택)" hint="비워 두면 할증·할인이 붙지 않습니다.">
            <SubGroup title="거리·일정" hint="원거리 출장, 긴급 예약 할증에 쓰입니다.">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="회사→현장 거리" suffix="km" nullable placeholder="미입력" value={input.distance_km} onChange={(v) => set({ distance_km: v })} />
                <NumberField label="시공일까지 남은 날" suffix="일" nullable placeholder="미입력" value={input.days_until_visit} onChange={(v) => set({ days_until_visit: v })} />
              </div>
            </SubGroup>
            {regular && (
              <SubGroup title="정기 계약 조건" hint="월·연 금액과 계약 할인에 쓰입니다.">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="월 방문 횟수" suffix="회" value={input.visits_per_month} onChange={(v) => set({ visits_per_month: v ?? 1 })} />
                  <NumberField label="계약 기간" suffix="개월" value={input.contract_months} onChange={(v) => set({ contract_months: v ?? 12 })} />
                  <NumberField label="재계약 연차" suffix="년차" nullable placeholder="신규" value={input.renewal_year} onChange={(v) => set({ renewal_year: v })} />
                  <NumberField label="지점 수 (공동계약)" suffix="개" nullable placeholder="단일" value={input.branch_count} onChange={(v) => set({ branch_count: v })} />
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={input.prepaid} onChange={(e) => set({ prepaid: e.target.checked })} /> 1년 선납</label>
                </div>
              </SubGroup>
            )}
            {enabledRules.length > 0 && (
              <SubGroup title="이 건에서 적용할 규칙" hint="끄면 이 계산에서만 제외됩니다. 기준값은 바뀌지 않습니다.">
                <div className="flex flex-wrap gap-2">
                  {enabledRules.map((r) => (
                    <label key={r.id} className="flex items-center gap-1.5 text-xs bg-surface border border-border-subtle rounded-lg px-2.5 py-1.5">
                      <input type="checkbox" checked={!input.disabled_rule_ids.includes(r.id)} onChange={() => toggleRule(r.id)} /> {r.name}
                    </label>
                  ))}
                </div>
              </SubGroup>
            )}
          </PricingSection>
        </div>

        <div className="lg:col-span-2 space-y-5 lg:sticky lg:top-4 self-start">
          <PricingSection n={4} title="산출 결과" tone="result" hint="왼쪽을 바꾸면 달라진 줄에 색이 칠해집니다.">
            <PriceBreakdown result={result} regular={regular} />
          </PricingSection>
          <PricingSection n={5} title="저장" hint="저장하면 견적관리의 '계산기 결과 불러오기'에 나타납니다.">
            <div className="flex flex-col gap-2">
              <Input label="메모 (업체명 등)" value={draft.label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder="예: 큰손닭강정 수원망포점 후드" />
              <Button onClick={handleSave} isLoading={isSaving}>결과 저장</Button>
            </div>
          </PricingSection>
        </div>
      </div>

      <ScrollToTopButton />
    </div>
  )
}
