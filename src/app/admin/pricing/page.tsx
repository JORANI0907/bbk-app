'use client'

/**
 * 비용 기준 탭 (관리자) — 서비스 유형별 기준값을 3단계로 편집하고 새 판으로 저장한다.
 *   - 편집 중인 내용은 브라우저에 남아 화면을 오가도 유지된다 (서비스 유형별로 따로).
 *   - 저장하면 새 판이 생기고 이전 판은 이력에 남는다.
 *   - 인원·1명당 시간은 여기서 정하지 않는다. 견적자가 계산기에서 현장을 보고 직접 적는다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Modal, ScrollToTopButton, SectionHeader, Spinner, Textarea } from '@/components/ui'
import { PricingBasicFields } from '@/components/pricing/PricingBasicFields'
import { GradeTable } from '@/components/pricing/GradeTable'
import { PricingSection, SubGroup } from '@/components/pricing/PricingSection'
import { SurchargeEditor, DiscountEditor } from '@/components/pricing/RuleListEditor'
import { usePricingRules } from '@/components/pricing/usePricingRules'
import { DEFAULT_PRICING } from '@/lib/pricing/defaults'
import { validatePricingConfig } from '@/lib/pricing/validate'
import { useLocalDraft } from '@/lib/use-local-draft'
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type PricingConfig, type PricingRuleRow, type PricingServiceType } from '@/lib/pricing/types'

interface SettingsDraft {
  type: PricingServiceType
  /** 저장하지 않은 편집본 (서비스 유형별) */
  edits: Partial<Record<PricingServiceType, PricingConfig>>
}

const EMPTY_DRAFT: SettingsDraft = { type: 'onetime_deep', edits: {} }

export default function PricingSettingsPage() {
  const router = useRouter()
  const { rules, isLoading, isSaving, save, history } = usePricingRules()
  const { value: draft, update: setDraft } = useLocalDraft<SettingsDraft>('bbk_pricing_settings_v3', EMPTY_DRAFT)
  const [showSave, setShowSave] = useState(false)
  const [note, setNote] = useState('')
  const [versions, setVersions] = useState<PricingRuleRow[] | null>(null)

  const type = draft.type
  const current = rules.find((r) => r.service_type === type) ?? null
  const edited = draft.edits[type] ?? null
  const config = edited ?? current?.config ?? null
  const dirty = useMemo(() => !!edited && JSON.stringify(edited) !== JSON.stringify(current?.config ?? null), [edited, current])

  // 편집본이 현재 판과 같아졌으면 편집본 표시를 지운다
  useEffect(() => {
    if (edited && current && JSON.stringify(edited) === JSON.stringify(current.config)) {
      setDraft((d) => { const edits = { ...d.edits }; delete edits[type]; return { ...d, edits } })
    }
  }, [edited, current, type, setDraft])

  const update = (next: PricingConfig) => setDraft((d) => ({ ...d, edits: { ...d.edits, [type]: next } }))
  const setType = (t: PricingServiceType) => setDraft((d) => ({ ...d, type: t }))
  const discard = () => setDraft((d) => { const edits = { ...d.edits }; delete edits[type]; return { ...d, edits } })

  const handleSave = async () => {
    if (!config) return
    const check = validatePricingConfig(config)
    if (!check.ok) { setShowSave(false); alert(check.errors.join('\n')); return }
    if (await save(type, check.config, note)) { setShowSave(false); setNote(''); discard() }
  }

  if (isLoading || !config) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="space-y-6">
      <SectionHeader
        level="page"
        title="비용 기준"
        subtitle="계산기가 쓰는 숫자를 정하는 곳입니다. ①~③을 채우고 '새 판으로 저장'을 누르면 적용됩니다. 편집 중인 내용은 이 브라우저에 남습니다."
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/pricing-calculator')}>계산기 열기</Button>
            <Button variant="secondary" size="sm" onClick={async () => setVersions(await history(type))}>변경 이력</Button>
            <Button size="sm" onClick={() => setShowSave(true)} disabled={!dirty || isSaving}>새 판으로 저장</Button>
          </div>
        }
      />

      <details className="bg-surface-sunken border border-border-subtle rounded-2xl p-4 text-sm">
        <summary className="font-semibold cursor-pointer">이 화면은 어떻게 쓰나요?</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-text-secondary break-keep">
          <li>서비스 종류를 고릅니다. 종류마다 숫자가 따로 저장됩니다.</li>
          <li>① 기본값: 시간당 단가와 한도. 금액의 뼈대입니다.</li>
          <li>② 난이도: 현장 상태에 따라 시간을 얼마나 늘릴지. 견적자가 계산기에서 고르는 등급입니다.</li>
          <li>③ 할증·할인: 켜 둔 규칙만 계산기에 나타납니다.</li>
          <li>몇 명이 몇 시간 일하는지는 여기서 정하지 않습니다. 견적자가 계산기에서 현장을 보고 직접 적습니다.</li>
          <li>저장하면 &ldquo;제N판&rdquo;이 생기고, 그 뒤 계산은 새 판을 씁니다. 이전 판은 변경 이력에서 다시 불러올 수 있습니다.</li>
        </ol>
      </details>

      <div className="inline-flex gap-1 bg-surface-sunken border border-border-subtle rounded-xl p-1 flex-wrap">
        {SERVICE_TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-brand-100 text-brand-800 shadow-soft' : 'text-text-secondary hover:text-text-primary hover:bg-surface'}`}>
            {SERVICE_TYPE_LABELS[t]}{draft.edits[t] ? ' •' : ''}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-text-tertiary">
        <span>{current?.id ? `현재 제${current.version_no}판 · ${current.note || '-'} · ${current.created_at ? new Date(current.created_at).toLocaleString('ko-KR') : ''}` : '아직 저장된 판이 없습니다. 아래는 기본값입니다.'}</span>
        {dirty && <span className="text-state-warning">저장되지 않은 편집본 <button className="underline ml-1" onClick={discard}>버리기</button></span>}
        <button className="underline" onClick={() => update(DEFAULT_PRICING[type])}>초기 기본값으로 채우기</button>
      </div>

      <PricingSection n={1} title="기본값" hint="시간당 단가 × 총 작업시간(인원 × 시/1인)이 금액의 출발점입니다. 인건비는 내부 마진 계산에만 쓰입니다.">
        <PricingBasicFields serviceType={type} config={config} onChange={update} />
      </PricingSection>

      <PricingSection n={2} title="난이도 등급" hint="견적자가 현장을 보고 고르는 등급입니다. 시간 계수는 견적자가 적은 1명당 시간에 곱하고, 단가 계수는 시간당 단가에 곱합니다(대부분 1.0).">
        <SubGroup title="등급 목록" hint="판단 기준을 글로 적어 두면 누가 견적해도 같은 등급을 고릅니다.">
          <GradeTable grades={config.difficulty_grades} onChange={(g) => update({ ...config, difficulty_grades: g })} />
        </SubGroup>
      </PricingSection>

      <PricingSection n={3} title="할증·할인 규칙" hint="'사용'에 체크한 규칙만 계산기에 나타나고, 조건이 맞을 때만 금액에 반영됩니다.">
        <SubGroup title="할증" hint="금액을 올리는 규칙">
          <SurchargeEditor rules={config.surcharges} onChange={(s) => update({ ...config, surcharges: s })} />
        </SubGroup>
        <SubGroup title="할인" hint="금액을 내리는 규칙">
          <DiscountEditor rules={config.discounts} onChange={(d) => update({ ...config, discounts: d })} />
        </SubGroup>
      </PricingSection>

      <ScrollToTopButton />

      <Modal
        open={showSave}
        onClose={() => setShowSave(false)}
        title={`${SERVICE_TYPE_LABELS[type]} 기준값 저장`}
        description="새 판으로 저장됩니다. 이전 판은 이력에 남고, 이미 저장된 계산 결과는 바뀌지 않습니다."
        footer={<div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setShowSave(false)}>취소</Button><Button onClick={handleSave} isLoading={isSaving}>저장</Button></div>}
      >
        <Textarea label="변경 메모" value={note} onChange={(e) => setNote(e.target.value)} autosize fullWidth placeholder="예: 딥케어 시간당 단가 50,000 → 55,000" maxLength={500} showCount />
      </Modal>

      <Modal open={versions !== null} onClose={() => setVersions(null)} title={`${SERVICE_TYPE_LABELS[type]} 변경 이력`} size="lg">
        <div className="divide-y divide-border-subtle">
          {(versions ?? []).length === 0 && <p className="text-sm text-text-tertiary py-4">저장된 판이 없습니다.</p>}
          {(versions ?? []).map((v) => (
            <div key={v.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1">
                <p className="text-sm font-semibold">제{v.version_no}판 {v.is_current && <span className="text-xs text-state-success ml-1">현재</span>}</p>
                <p className="text-xs text-text-secondary break-keep">{v.note || '-'}</p>
              </div>
              <p className="text-xs text-text-tertiary">{new Date(v.created_at).toLocaleString('ko-KR')}</p>
              <Button variant="ghost" size="sm" onClick={() => { update(v.config); setVersions(null) }}>이 판 불러오기</Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
