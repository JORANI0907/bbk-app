'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ServiceSchedule,
  ConditionScore,
  RecommendedService,
  RecommendationPriority,
} from '@/types/database'
import { WorkStepIndicator } from '@/components/worker/WorkStepIndicator'
import { PhotoUploader } from '@/components/worker/PhotoUploader'
import { ChecklistForm } from '@/components/worker/ChecklistForm'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Rocket, MapPin, User } from 'lucide-react'

const CLOSING_ITEMS = [
  { key: 'garbage_disposal', label: '쓰레기 처리 완료' },
  { key: 'gas_valve_check', label: '가스 밸브 잠금 확인' },
  { key: 'electric_check', label: '전기 기기 확인' },
  { key: 'security_check', label: '보안 상태 확인' },
  { key: 'door_lock_check', label: '문단속 확인' },
]

const RECOMMENDABLE_SERVICES = [
  '바닥왁스',
  '카펫청소',
  '에어컨필터',
  '창문청소',
  '주방후드',
  '욕실방수',
  '외벽청소',
  '소독방역',
] as const

const CONDITION_OPTIONS: {
  value: ConditionScore
  label: string
  tone: string
  activeTone: string
}[] = [
  {
    value: 1,
    label: '양호',
    tone: 'border-border bg-surface text-text-secondary',
    activeTone: 'border-green-500 bg-green-50 text-green-700',
  },
  {
    value: 2,
    label: '주의',
    tone: 'border-border bg-surface text-text-secondary',
    activeTone: 'border-yellow-500 bg-yellow-50 text-yellow-700',
  },
  {
    value: 3,
    label: '불량',
    tone: 'border-border bg-surface text-text-secondary',
    activeTone: 'border-red-500 bg-red-50 text-red-700',
  },
]

const PRIORITY_OPTIONS: {
  value: RecommendationPriority
  label: string
  dotColor: string
}[] = [
  { value: 'high', label: '높음', dotColor: 'bg-red-500' },
  { value: 'medium', label: '보통', dotColor: 'bg-yellow-500' },
  { value: 'low', label: '낮음', dotColor: 'bg-gray-400' },
]

type ClosingState = Record<string, boolean>
type RecommendationState = Record<
  string,
  { reason: string; priority: RecommendationPriority }
>

export default function ScheduleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const scheduleId = params.id as string

  const [schedule, setSchedule] = useState<ServiceSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [closingState, setClosingState] = useState<ClosingState>({
    garbage_disposal: false,
    gas_valve_check: false,
    electric_check: false,
    security_check: false,
    door_lock_check: false,
  })
  const [conditionScore, setConditionScore] = useState<ConditionScore | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationState>({})

  const loadSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/worker/schedule/${scheduleId}`)
      if (!res.ok) throw new Error('일정을 찾을 수 없습니다.')
      const data = await res.json()
      setSchedule(data.schedule as ServiceSchedule)
      setCurrentStep(data.schedule.work_step ?? 0)
      setIsAdmin(data.isAdmin ?? false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [scheduleId])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const patchSchedule = async (updates: Record<string, unknown>) => {
    const res = await fetch(`/api/worker/schedule/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? '업데이트 실패')
    }
  }

  const updateStep = async (newStep: number) => {
    setIsSubmitting(true)
    try {
      const updates: Record<string, unknown> = { work_step: newStep }

      if (newStep === 1) {
        updates.status = 'in_progress'
        updates.actual_arrival = new Date().toISOString()
      }
      if (newStep >= 5) {
        updates.status = 'completed'
        updates.actual_completion = new Date().toISOString()
      }

      await patchSchedule(updates)
      setCurrentStep(newStep)
      toast.success('단계가 업데이트되었습니다.')
    } catch (err) {
      console.error('단계 업데이트 실패:', err)
      toast.error('업데이트에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleArrival = async () => {
    setIsSubmitting(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        }),
      )

      await patchSchedule({
        work_step: 2,
        status: 'in_progress',
        actual_arrival: new Date().toISOString(),
        arrival_lat: position.coords.latitude,
        arrival_lng: position.coords.longitude,
      })

      setCurrentStep(2)
      toast.success('도착이 확인되었습니다.')
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        toast.error('위치 정보를 가져올 수 없습니다. GPS를 켜주세요.')
      } else {
        toast.error('오류가 발생했습니다.')
      }
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleRecommendation = (name: string) => {
    setRecommendations((prev) => {
      if (prev[name]) {
        const next = { ...prev }
        delete next[name]
        return next
      }
      return { ...prev, [name]: { reason: '', priority: 'medium' } }
    })
  }

  const updateRecommendation = (
    name: string,
    patch: Partial<{ reason: string; priority: RecommendationPriority }>,
  ) => {
    setRecommendations((prev) => {
      if (!prev[name]) return prev
      return { ...prev, [name]: { ...prev[name], ...patch } }
    })
  }

  const handleFinalComplete = async () => {
    const allChecked = CLOSING_ITEMS.every((item) => closingState[item.key])
    if (!allChecked) {
      toast.error('모든 마감 체크리스트를 완료해주세요.')
      return
    }
    if (!conditionScore) {
      toast.error('전반적 상태를 선택해주세요.')
      return
    }

    const recommendedServices: RecommendedService[] = Object.entries(
      recommendations,
    ).map(([name, value]) => ({
      name,
      reason: value.reason.trim(),
      priority: value.priority,
    }))

    setIsSubmitting(true)
    try {
      await patchSchedule({
        work_step: 6,
        status: 'completed',
        actual_completion: new Date().toISOString(),
        closing_checklist: {
          ...closingState,
          condition_score: conditionScore,
          recommended_services: recommendedServices,
        },
      })

      toast.success('작업이 완료되었습니다!')
      router.push('/worker')
    } catch (err) {
      console.error('완료 처리 실패:', err)
      toast.error('완료 처리에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-tertiary text-sm">불러오는 중...</div>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-text-secondary">일정을 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="text-brand-600 underline text-sm">
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="bg-surface px-4 py-4 border-b border-border-subtle">
        <button onClick={() => router.back()} className="text-brand-600 text-sm mb-2 flex items-center gap-1">
          ← 목록으로
        </button>
        <h1 className="text-lg font-bold text-text-primary">
          {schedule.customer?.business_name ?? '현장 작업'}
        </h1>
        <p className="text-sm text-text-secondary">{schedule.customer?.address}</p>
      </div>

      {isAdmin && schedule.worker && (
        <div className="bg-brand-50 border-b border-brand-100 px-4 py-2 flex items-center gap-2">
          <User size={14} className="text-brand-600" />
          <span className="text-brand-600 text-sm">담당:</span>
          <span className="text-brand-700 text-sm font-semibold">{(schedule.worker as { name?: string }).name ?? '미배정'}</span>
          <span className="ml-auto text-xs text-brand-400">[관리자 모니터링]</span>
        </div>
      )}

      <WorkStepIndicator currentStep={currentStep} />

      <div className="px-4 py-6 flex flex-col gap-6">
        {currentStep === 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Rocket size={48} className="text-brand-600" />
            <div className="text-center">
              <h2 className="text-xl font-bold text-text-primary">작업을 시작할 준비가 되셨나요?</h2>
              <p className="text-sm text-text-secondary mt-2">
                {schedule.scheduled_time_start.slice(0, 5)} ~{' '}
                {schedule.scheduled_time_end.slice(0, 5)} 예정
              </p>
            </div>
            <Button
              onClick={() => updateStep(1)}
              disabled={isSubmitting}
              isLoading={isSubmitting}
              variant="primary"
              className="mt-4 w-full max-w-xs py-4 text-lg font-bold rounded-2xl active:scale-[0.98]"
            >
              {isSubmitting ? '처리 중...' : '작업 시작'}
            </Button>
          </div>
        )}

        {currentStep === 1 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <MapPin size={48} className="text-orange-500" />
            <div className="text-center">
              <h2 className="text-xl font-bold text-text-primary">현장에 도착하셨나요?</h2>
              <p className="text-sm text-text-secondary mt-2">GPS 위치가 자동으로 기록됩니다.</p>
            </div>
            {schedule.customer?.door_password && (
              <div className="w-full max-w-xs bg-state-warning-bg border border-state-warning rounded-xl p-3">
                <p className="text-xs text-state-warning font-medium">비밀번호: {schedule.customer.door_password}</p>
              </div>
            )}
            <Button
              onClick={handleArrival}
              disabled={isSubmitting}
              isLoading={isSubmitting}
              variant="primary"
              className="mt-4 w-full max-w-xs py-4 text-lg font-bold rounded-2xl active:scale-[0.98] bg-orange-500 hover:bg-orange-600"
            >
              {isSubmitting ? '처리 중...' : '도착 확인'}
            </Button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-text-primary">작업 전 사진을 촬영해주세요</h2>
              <p className="text-sm text-text-secondary mt-1">현장 상태를 꼼꼼히 기록해주세요.</p>
            </div>
            <PhotoUploader
              scheduleId={scheduleId}
              photoType="before"
              onUploadComplete={() => updateStep(3)}
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-text-primary">작업을 수행해주세요</h2>
              <p className="text-sm text-text-secondary mt-1">각 항목을 순서대로 완료해주세요.</p>
            </div>
            <ChecklistForm
              scheduleId={scheduleId}
              items={schedule.items_this_visit}
              onComplete={() => updateStep(4)}
            />
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-text-primary">작업 후 사진을 촬영해주세요</h2>
              <p className="text-sm text-text-secondary mt-1">깨끗해진 현장을 기록해주세요.</p>
            </div>
            <PhotoUploader
              scheduleId={scheduleId}
              photoType="after"
              onUploadComplete={() => updateStep(5)}
            />
          </div>
        )}

        {currentStep >= 5 && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-text-primary">마감 체크리스트</h2>
              <p className="text-sm text-text-secondary mt-1">퇴장 전 모든 항목을 확인해주세요.</p>
            </div>
            <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
              {CLOSING_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() =>
                    setClosingState((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-border-subtle last:border-0 hover:bg-surface-sunken transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      closingState[item.key]
                        ? 'bg-brand-600 border-brand-600'
                        : 'border-border-strong'
                    }`}
                  >
                    {closingState[item.key] && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm ${closingState[item.key] ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* 전반적 상태 평가 */}
            <div className="flex flex-col gap-2">
              <div>
                <h3 className="text-base font-bold text-text-primary">전반적 상태</h3>
                <p className="text-xs text-text-tertiary mt-0.5">현장 상태를 평가해주세요. 고객 리포트에 반영됩니다.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CONDITION_OPTIONS.map((opt) => {
                  const isActive = conditionScore === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setConditionScore(opt.value)}
                      className={`py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                        isActive ? opt.activeTone : opt.tone
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 추가 추천 서비스 */}
            <div className="flex flex-col gap-2">
              <div>
                <h3 className="text-base font-bold text-text-primary">추가 서비스 추천 (선택)</h3>
                <p className="text-xs text-text-tertiary mt-0.5">고객에게 권장할 서비스를 선택하고 이유를 적어주세요.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {RECOMMENDABLE_SERVICES.map((name) => {
                  const selected = !!recommendations[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleRecommendation(name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-surface text-text-secondary border-border'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {name}
                    </button>
                  )
                })}
              </div>

              {Object.entries(recommendations).length > 0 && (
                <div className="mt-2 flex flex-col gap-3">
                  {Object.entries(recommendations).map(([name, value]) => (
                    <div
                      key={name}
                      className="rounded-2xl border border-border-subtle bg-surface shadow-soft p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-text-primary">{name}</span>
                        <button
                          type="button"
                          onClick={() => toggleRecommendation(name)}
                          className="text-xs text-text-tertiary hover:text-red-600"
                        >
                          제거
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {PRIORITY_OPTIONS.map((opt) => {
                          const isActive = value.priority === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                updateRecommendation(name, { priority: opt.value })
                              }
                              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                isActive
                                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                                  : 'border-border bg-surface text-text-secondary'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      <textarea
                        value={value.reason}
                        onChange={(e) =>
                          updateRecommendation(name, { reason: e.target.value })
                        }
                        placeholder="추천 이유를 간단히 적어주세요 (예: 바닥에 묵은 때가 누적되어 있음)"
                        rows={2}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-600"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleFinalComplete}
              disabled={
                isSubmitting ||
                !CLOSING_ITEMS.every((i) => closingState[i.key]) ||
                !conditionScore
              }
              isLoading={isSubmitting}
              variant="primary"
              className="w-full py-4 text-lg font-bold rounded-2xl active:scale-[0.98] bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? '처리 중...' : '작업 완료'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
