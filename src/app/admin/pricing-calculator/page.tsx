'use client'

/**
 * 비용 계산기 (관리자·직원) — 5단계: ① 서비스 ② 현장 ③ 전문가 조정 ④ 조건 ⑤ 결과.
 *   - 입력은 브라우저에 남아 화면을 오가도 유지된다 (서비스 유형별로 따로).
 *   - 결과는 저장할 수 있고 견적관리에서 불러올 수 있다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input, ScrollToTopButton, SectionHeader, Select, Spinner } from '@/components/ui'
import { NumberField } from '@/components/pricing/NumberField'
import { PriceBreakdown } from '@/components/pricing/PriceBreakdown'
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
  const { value: draft, update: setDraft, clear: clearDraft, restored } = useLocalDraft<CalcDraft>('bbk_pricing_calc_v2', EMPTY_DRAFT)
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
        size_name: cfg.size_tiers.find((t) => t.id === input.size_tier_id)?.name ?? null,
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

  const autoResult = calculatePrice(cfg, { ...input, hours_per_worker_override: null, workers_override: null })
  const autoHours = autoResult.hours_per_worker
  const autoWorkers = autoResult.workers
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
        <div className="lg:col-span-3 space-y-4">
          <Step n={1} title="서비스 종류" hint={`${rule?.id ? `기준 제${rule.version_no}판` : '기준 기본값(미저장)'}으로 계산합니다.`}>
            <div className="inline-flex gap-1 bg-surface-sunken rounded-xl p-1 flex-wrap">
              {SERVICE_TYPES.map((t) => (
                <button key={t} onClick={() => setType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                  {SERVICE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title="현장 규모와 난이도" hint="규모를 고르면 보통 몇 명이 몇 시간 일하는지가 정해지고, 난이도 계수가 1명당 시간에 곱해집니다.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select label="규모 (평수)" value={input.size_tier_id ?? ''} onChange={(e) => set({ size_tier_id: e.target.value || null })} fullWidth>
                {cfg.size_tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.min_pyeong}~{t.max_pyeong ?? ''}평 · {t.workers}명 × {t.hours_per_worker}시/1인</option>)}
              </Select>
              <Select label="난이도" value={input.difficulty_id} onChange={(e) => set({ difficulty_id: e.target.value })} fullWidth>
                {cfg.difficulty_grades.map((g) => <option key={g.id} value={g.id}>{g.name} · 시간 ×{g.time_factor}</option>)}
              </Select>
            </div>
            <p className="text-xs text-text-secondary mt-2 break-keep">판단 기준: {cfg.difficulty_grades.find((g) => g.id === input.difficulty_id)?.criteria || '-'}</p>
          </Step>

          <Step n={3} title="전문가 조정 (선택)" hint={`자동 산출: ${autoWorkers}명 × ${autoHours}시/1인 = 총 ${autoResult.total_hours}시간. 현장을 보고 다르다고 판단되면 여기에 적으세요. 비우면 자동값입니다.`}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="투입 인원" suffix="명" nullable placeholder={`자동 ${autoWorkers}`} value={input.workers_override} onChange={(v) => set({ workers_override: v })} />
              <NumberField label="1명당 시간" suffix="시/1인" step={0.5} nullable placeholder={`자동 ${autoHours}`} value={input.hours_per_worker_override} onChange={(v) => set({ hours_per_worker_override: v })} />
            </div>
            <p className="text-xs text-text-tertiary mt-2">총 작업시간 = 인원 × 1명당 시간 = <strong className="text-text-primary">{result.total_hours}시간</strong></p>
          </Step>

          <Step n={4} title="조건 (선택)" hint="비워 두면 할증·할인이 붙지 않습니다.">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="회사→현장 거리" suffix="km" nullable placeholder="미입력" value={input.distance_km} onChange={(v) => set({ distance_km: v })} />
              <NumberField label="시공일까지 남은 날" suffix="일" nullable placeholder="미입력" value={input.days_until_visit} onChange={(v) => set({ days_until_visit: v })} />
            </div>
            {regular && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <NumberField label="월 방문 횟수" suffix="회" value={input.visits_per_month} onChange={(v) => set({ visits_per_month: v ?? 1 })} />
                <NumberField label="계약 기간" suffix="개월" value={input.contract_months} onChange={(v) => set({ contract_months: v ?? 12 })} />
                <NumberField label="재계약 연차" suffix="년차" nullable placeholder="신규" value={input.renewal_year} onChange={(v) => set({ renewal_year: v })} />
                <NumberField label="지점 수 (공동계약)" suffix="개" nullable placeholder="단일" value={input.branch_count} onChange={(v) => set({ branch_count: v })} />
                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={input.prepaid} onChange={(e) => set({ prepaid: e.target.checked })} /> 1년 선납</label>
              </div>
            )}
            {enabledRules.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-text-secondary mb-1.5">이 건에서 적용할 규칙 (끄면 이 계산에서만 제외)</p>
                <div className="flex flex-wrap gap-2">
                  {enabledRules.map((r) => (
                    <label key={r.id} className="flex items-center gap-1.5 text-xs bg-surface-sunken rounded-lg px-2.5 py-1.5">
                      <input type="checkbox" checked={!input.disabled_rule_ids.includes(r.id)} onChange={() => toggleRule(r.id)} /> {r.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Step>
        </div>

        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 self-start">
          <Step n={5} title="산출 결과" hint="왼쪽을 바꾸면 달라진 줄에 색이 칠해집니다.">
            <PriceBreakdown result={result} regular={regular} />
          </Step>
          <Step n={6} title="저장" hint="저장하면 견적관리의 '계산기 결과 불러오기'에 나타납니다.">
            <div className="flex flex-col gap-2">
              <Input label="메모 (업체명 등)" value={draft.label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder="예: 큰손닭강정 수원망포점 후드" />
              <Button onClick={handleSave} isLoading={isSaving}>결과 저장</Button>
            </div>
          </Step>
        </div>
      </div>

      <ScrollToTopButton />
    </div>
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-border-subtle rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">{n}</span>
        <div>
          <p className="text-base font-semibold leading-snug">{title}</p>
          {hint && <p className="text-xs text-text-secondary mt-0.5 break-keep">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
