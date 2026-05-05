import { WORK_STEPS } from '@/lib/constants'
import { Check } from 'lucide-react'

interface Props {
  currentStep: number // 0-5
}

export function WorkStepIndicator({ currentStep }: Props) {
  return (
    <div className="bg-surface px-4 py-4 border-b border-border-subtle">
      <div className="flex items-center justify-between">
        {WORK_STEPS.map((step, index) => {
          const isDone = currentStep > step.step
          const isCurrent = currentStep === step.step
          const isPending = currentStep < step.step

          return (
            <div key={step.step} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${isDone ? 'bg-brand-600 text-white' : ''}
                    ${isCurrent ? 'bg-orange-500 text-white animate-pulse' : ''}
                    ${isPending ? 'bg-surface-sunken text-text-tertiary' : ''}
                  `}
                >
                  {isDone ? <Check size={14} strokeWidth={3} /> : step.step}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight max-w-[52px] ${
                    isDone
                      ? 'text-brand-600 font-medium'
                      : isCurrent
                        ? 'text-orange-500 font-medium'
                        : 'text-text-tertiary'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < WORK_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-5 rounded-full transition-colors ${
                    currentStep > step.step ? 'bg-brand-600' : 'bg-border'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
