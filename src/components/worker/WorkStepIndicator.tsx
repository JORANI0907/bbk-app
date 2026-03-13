import { WORK_STEPS } from '@/lib/constants'

interface Props {
  currentStep: number // 0-5
}

export function WorkStepIndicator({ currentStep }: Props) {
  return (
    <div className="bg-white px-4 py-4 border-b border-gray-100">
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
                    ${isDone ? 'bg-blue-600 text-white' : ''}
                    ${isCurrent ? 'bg-orange-500 text-white animate-pulse' : ''}
                    ${isPending ? 'bg-gray-200 text-gray-400' : ''}
                  `}
                >
                  {isDone ? '✓' : step.step}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight max-w-[52px] ${
                    isDone
                      ? 'text-blue-600 font-medium'
                      : isCurrent
                        ? 'text-orange-500 font-medium'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < WORK_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-5 rounded-full transition-colors ${
                    currentStep > step.step ? 'bg-blue-600' : 'bg-gray-200'
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
