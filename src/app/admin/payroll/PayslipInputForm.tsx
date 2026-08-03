'use client'

import type { EmploymentType } from '@/lib/payroll/types'

export interface FormState {
  employmentType: EmploymentType
  paymentDate: string
  monthlyBaseSalary: string
  hourlyWage: string
  dailyWage: string
  contractedMonthlyHours: string
  contractedWeeklyHours: string
  actualMonthlyHours: string
  workDays: string
  dailyContractedHours: string
  overtimeHours: string
  nightHours: string
  holidayHoursWithin8: string
  holidayHoursOver8: string
  unusedAnnualLeaveDays: string
  otherTaxableAllowance: string
  mealAllowance: string
  carAllowance: string
  enrolledNationalPension: boolean
  enrolledHealthInsurance: boolean
  enrolledEmploymentInsurance: boolean
  incomeTax: string
  dependents: string
  otherDeductions: string
}

const EMP_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'FULL_TIME',   label: '정규직' },
  { value: 'CONTRACT',    label: '계약직' },
  { value: 'PART_TIME',   label: '단시간근로자 (주15h 이상)' },
  { value: 'ULTRA_SHORT', label: '초단시간근로자 (주15h 미만)' },
  { value: 'DAILY',       label: '일용직' },
  { value: 'FREELANCER',  label: '프리랜서 3.3%' },
  { value: 'SUBCONTRACT', label: '외주/도급 (명세서 불발급)' },
]

interface NumInputProps {
  label: string
  value: string
  field: keyof FormState
  unit?: string
  hint?: string
  onChange: (patch: Partial<FormState>) => void
}

function NumInput({ label, value, field, onChange, unit = '원', hint }: NumInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => onChange({ [field]: e.target.value } as Partial<FormState>)}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm text-text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <span className="text-xs text-text-tertiary shrink-0">{unit}</span>
      </div>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-border'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  )
}

interface Props {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
}

export default function PayslipInputForm({ form, onChange }: Props) {
  const et = form.employmentType
  const isMonthlySalary = et === 'FULL_TIME' || et === 'CONTRACT'
  const isHourly = et === 'PART_TIME' || et === 'ULTRA_SHORT'
  const isDaily = et === 'DAILY'
  const isFreelancer = et === 'FREELANCER'
  const isSub = et === 'SUBCONTRACT'
  const showPremium = !isDaily && !isFreelancer && !isSub

  if (isSub) {
    return (
      <div className="p-6 text-center">
        <p className="text-text-secondary text-sm">외주/도급 근로자는 법정 급여명세서 발급 대상이 아닙니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      {/* 기본 정보 */}
      <section>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">기본 정보</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">고용 형태</label>
            <select
              value={form.employmentType}
              onChange={e => onChange({ employmentType: e.target.value as EmploymentType })}
              className="w-full rounded-md border border-border px-3 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">지급일</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={e => onChange({ paymentDate: e.target.value })}
              className="w-full rounded-md border border-border px-3 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
      </section>

      {/* 급여 기준 */}
      <section>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">급여 기준</h3>
        <div className="space-y-3">
          {isMonthlySalary && (
            <>
              <NumInput label="월 기본급" value={form.monthlyBaseSalary} field="monthlyBaseSalary" onChange={onChange} />
              <NumInput label="계약 월 근무시간" value={form.contractedMonthlyHours} field="contractedMonthlyHours" onChange={onChange} unit="시간" hint="기본값 209시간" />
            </>
          )}
          {isHourly && (
            <>
              <NumInput label="시급" value={form.hourlyWage} field="hourlyWage" onChange={onChange} />
              <NumInput label="주 소정근로시간" value={form.contractedWeeklyHours} field="contractedWeeklyHours" onChange={onChange} unit="시간" />
              <NumInput label="이번 달 실제 근무시간" value={form.actualMonthlyHours} field="actualMonthlyHours" onChange={onChange} unit="시간" />
            </>
          )}
          {isDaily && (
            <>
              <NumInput label="일 급여" value={form.dailyWage} field="dailyWage" onChange={onChange} />
              <NumInput label="근무 일수" value={form.workDays} field="workDays" onChange={onChange} unit="일" />
              <NumInput label="일 소정근로시간" value={form.dailyContractedHours} field="dailyContractedHours" onChange={onChange} unit="시간" hint="기본값 8시간" />
            </>
          )}
          {isFreelancer && (
            <NumInput label="용역대가 (총액)" value={form.monthlyBaseSalary} field="monthlyBaseSalary" onChange={onChange} hint="3.3% 원천징수 기준" />
          )}
        </div>
      </section>

      {/* 가산 근무 (일용/프리랜서 제외) */}
      {showPremium && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">가산 근무시간</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="연장 시간" value={form.overtimeHours} field="overtimeHours" onChange={onChange} unit="h" />
            <NumInput label="야간 시간" value={form.nightHours} field="nightHours" onChange={onChange} unit="h" />
            <NumInput label="휴일 8h 이내" value={form.holidayHoursWithin8} field="holidayHoursWithin8" onChange={onChange} unit="h" />
            <NumInput label="휴일 8h 초과" value={form.holidayHoursOver8} field="holidayHoursOver8" onChange={onChange} unit="h" />
            <NumInput label="미사용 연차" value={form.unusedAnnualLeaveDays} field="unusedAnnualLeaveDays" onChange={onChange} unit="일" />
          </div>
        </section>
      )}

      {/* 수당 */}
      {!isFreelancer && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">수당</h3>
          <div className="space-y-3">
            <NumInput label="식대 (비과세 한도 20만원)" value={form.mealAllowance} field="mealAllowance" onChange={onChange} />
            <NumInput label="차량유지비 (비과세 한도 20만원)" value={form.carAllowance} field="carAllowance" onChange={onChange} />
            <NumInput label="기타 과세 수당" value={form.otherTaxableAllowance} field="otherTaxableAllowance" onChange={onChange} />
          </div>
        </section>
      )}

      {/* 4대보험 */}
      {!isFreelancer && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">4대보험 가입 여부</h3>
          <div className="space-y-3">
            <Toggle label="국민연금" checked={form.enrolledNationalPension} onChange={v => onChange({ enrolledNationalPension: v })} />
            <Toggle label="건강보험 (장기요양 포함)" checked={form.enrolledHealthInsurance} onChange={v => onChange({ enrolledHealthInsurance: v })} />
            <Toggle label="고용보험" checked={form.enrolledEmploymentInsurance} onChange={v => onChange({ enrolledEmploymentInsurance: v })} />
          </div>
        </section>
      )}

      {/* 소득세 */}
      {!isFreelancer && (
        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">소득세</h3>
          <div className="space-y-3">
            <NumInput label="부양가족 수" value={form.dependents} field="dependents" onChange={onChange} unit="명" hint="본인 포함 기본 1명" />
            <NumInput label="소득세" value={form.incomeTax} field="incomeTax" onChange={onChange} hint="0이면 근로소득 간이세액표 기준 수동 입력 필요" />
            <NumInput label="기타 공제" value={form.otherDeductions} field="otherDeductions" onChange={onChange} />
          </div>
        </section>
      )}
    </div>
  )
}
