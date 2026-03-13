'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ServiceSchedule } from '@/types/database'
import { WorkStepIndicator } from '@/components/worker/WorkStepIndicator'
import { PhotoUploader } from '@/components/worker/PhotoUploader'
import { ChecklistForm } from '@/components/worker/ChecklistForm'
import toast from 'react-hot-toast'

const CLOSING_ITEMS = [
  { key: 'garbage_disposal', label: '쓰레기 처리 완료' },
  { key: 'gas_valve_check', label: '가스 밸브 잠금 확인' },
  { key: 'electric_check', label: '전기 기기 확인' },
  { key: 'security_check', label: '보안 상태 확인' },
  { key: 'door_lock_check', label: '문단속 확인' },
]

type ClosingState = Record<string, boolean>

export default function ScheduleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const scheduleId = params.id as string

  const [schedule, setSchedule] = useState<ServiceSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [closingState, setClosingState] = useState<ClosingState>({
    garbage_disposal: false,
    gas_valve_check: false,
    electric_check: false,
    security_check: false,
    door_lock_check: false,
  })

  const loadSchedule = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('service_schedules')
      .select('*, customer:customers(*)')
      .eq('id', scheduleId)
      .single()

    if (data) {
      setSchedule(data as ServiceSchedule)
      setCurrentStep(data.work_step)
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const updateStep = async (newStep: number) => {
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const updates: Record<string, unknown> = { work_step: newStep }

      if (newStep === 1) {
        updates.status = 'in_progress'
        updates.actual_arrival = new Date().toISOString()
      }
      if (newStep === 5 || newStep > 5) {
        updates.status = 'completed'
        updates.actual_completion = new Date().toISOString()
      }

      const { error } = await supabase
        .from('service_schedules')
        .update(updates)
        .eq('id', scheduleId)

      if (error) throw error

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
      const supabase = createClient()

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        }),
      )

      const { error } = await supabase
        .from('service_schedules')
        .update({
          work_step: 2,
          status: 'in_progress',
          actual_arrival: new Date().toISOString(),
          arrival_lat: position.coords.latitude,
          arrival_lng: position.coords.longitude,
        })
        .eq('id', scheduleId)

      if (error) throw error

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

  const handleFinalComplete = async () => {
    const allChecked = CLOSING_ITEMS.every((item) => closingState[item.key])
    if (!allChecked) {
      toast.error('모든 마감 체크리스트를 완료해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const supabase = createClient()

      const { data: existing } = await supabase
        .from('closing_checklists')
        .select('id')
        .eq('schedule_id', scheduleId)
        .single()

      if (existing) {
        await supabase
          .from('closing_checklists')
          .update({
            ...closingState,
            completed_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('closing_checklists').insert({
          schedule_id: scheduleId,
          ...closingState,
          completed_at: new Date().toISOString(),
        })
      }

      await supabase
        .from('service_schedules')
        .update({
          work_step: 6,
          status: 'completed',
          actual_completion: new Date().toISOString(),
        })
        .eq('id', scheduleId)

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
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-500">일정을 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="text-blue-600 underline text-sm">
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="text-blue-600 text-sm mb-2 flex items-center gap-1">
          ← 목록으로
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {schedule.customer?.business_name ?? '현장 작업'}
        </h1>
        <p className="text-sm text-gray-500">{schedule.customer?.address}</p>
      </div>

      <WorkStepIndicator currentStep={currentStep} />

      <div className="px-4 py-6 flex flex-col gap-6">
        {currentStep === 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <span className="text-5xl">🚀</span>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900">작업을 시작할 준비가 되셨나요?</h2>
              <p className="text-sm text-gray-500 mt-2">
                {schedule.scheduled_time_start.slice(0, 5)} ~{' '}
                {schedule.scheduled_time_end.slice(0, 5)} 예정
              </p>
            </div>
            <button
              onClick={() => updateStep(1)}
              disabled={isSubmitting}
              className="mt-4 w-full max-w-xs py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-60"
            >
              작업 시작
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <span className="text-5xl">📍</span>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900">현장에 도착하셨나요?</h2>
              <p className="text-sm text-gray-500 mt-2">GPS 위치가 자동으로 기록됩니다.</p>
            </div>
            {schedule.customer?.door_password && (
              <div className="w-full max-w-xs bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs text-yellow-700 font-medium">비밀번호: {schedule.customer.door_password}</p>
              </div>
            )}
            <button
              onClick={handleArrival}
              disabled={isSubmitting}
              className="mt-4 w-full max-w-xs py-4 bg-orange-500 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-60"
            >
              도착 확인
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900">작업 전 사진을 촬영해주세요</h2>
              <p className="text-sm text-gray-500 mt-1">현장 상태를 꼼꼼히 기록해주세요.</p>
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
              <h2 className="text-lg font-bold text-gray-900">작업을 수행해주세요</h2>
              <p className="text-sm text-gray-500 mt-1">각 항목을 순서대로 완료해주세요.</p>
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
              <h2 className="text-lg font-bold text-gray-900">작업 후 사진을 촬영해주세요</h2>
              <p className="text-sm text-gray-500 mt-1">깨끗해진 현장을 기록해주세요.</p>
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
              <h2 className="text-lg font-bold text-gray-900">마감 체크리스트</h2>
              <p className="text-sm text-gray-500 mt-1">퇴장 전 모든 항목을 확인해주세요.</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {CLOSING_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() =>
                    setClosingState((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      closingState[item.key]
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {closingState[item.key] && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm ${closingState[item.key] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={handleFinalComplete}
              disabled={isSubmitting || !CLOSING_ITEMS.every((i) => closingState[i.key])}
              className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
            >
              작업 완료
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
