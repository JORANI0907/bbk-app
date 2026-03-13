'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ServiceItem } from '@/types/database'
import toast from 'react-hot-toast'

interface ChecklistEntry {
  itemName: string
  steps: { label: string; done: boolean }[]
  dbId: string | null
  isCompleted: boolean
}

const DEFAULT_STEPS = ['사전점검', '작업수행', '마무리']

interface Props {
  scheduleId: string
  items: ServiceItem[]
  onComplete: () => void
}

export function ChecklistForm({ scheduleId, items, onComplete }: Props) {
  const [checklists, setChecklists] = useState<ChecklistEntry[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const loadChecklists = async () => {
      const { data: existing } = await supabase
        .from('work_checklists')
        .select('*')
        .eq('schedule_id', scheduleId)

      const entries: ChecklistEntry[] = items.map((item) => {
        const found = existing?.find((e) => e.item_name === item.name)
        if (found) {
          return {
            itemName: item.name,
            steps: found.checklist_items.map((ci: { step: string; done: boolean }) => ({
              label: ci.step,
              done: ci.done,
            })),
            dbId: found.id,
            isCompleted: found.is_completed,
          }
        }
        return {
          itemName: item.name,
          steps: DEFAULT_STEPS.map((label) => ({ label, done: false })),
          dbId: null,
          isCompleted: false,
        }
      })
      setChecklists(entries)
    }

    loadChecklists()
  }, [scheduleId, items])

  const toggleStep = async (itemIndex: number, stepIndex: number) => {
    const updated = checklists.map((entry, i) => {
      if (i !== itemIndex) return entry
      const newSteps = entry.steps.map((s, si) =>
        si === stepIndex ? { ...s, done: !s.done } : s,
      )
      const isCompleted = newSteps.every((s) => s.done)
      return { ...entry, steps: newSteps, isCompleted }
    })
    setChecklists(updated)

    setSaving(true)
    try {
      const supabase = createClient()
      const entry = updated[itemIndex]
      const checklistItems = entry.steps.map((s) => ({
        step: s.label,
        done: s.done,
        done_at: s.done ? new Date().toISOString() : undefined,
      }))

      if (entry.dbId) {
        await supabase
          .from('work_checklists')
          .update({
            checklist_items: checklistItems,
            is_completed: entry.isCompleted,
            completed_at: entry.isCompleted ? new Date().toISOString() : null,
          })
          .eq('id', entry.dbId)
      } else {
        const { data: inserted } = await supabase
          .from('work_checklists')
          .insert({
            schedule_id: scheduleId,
            item_name: entry.itemName,
            checklist_items: checklistItems,
            is_completed: entry.isCompleted,
            completed_at: entry.isCompleted ? new Date().toISOString() : null,
          })
          .select()
          .single()

        if (inserted) {
          setChecklists((prev) =>
            prev.map((e, i) => (i === itemIndex ? { ...e, dbId: inserted.id } : e)),
          )
        }
      }

      const allDone = updated.every((e) => e.isCompleted)
      if (allDone) {
        toast.success('모든 체크리스트를 완료했습니다!')
        onComplete()
      }
    } catch (err) {
      console.error('체크리스트 저장 실패:', err)
      toast.error('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const allCompleted = checklists.length > 0 && checklists.every((e) => e.isCompleted)

  return (
    <div className="flex flex-col gap-4">
      {checklists.map((entry, itemIndex) => (
        <div key={entry.itemName} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className={`px-4 py-3 flex items-center justify-between ${
              entry.isCompleted ? 'bg-green-50' : 'bg-gray-50'
            }`}
          >
            <h3 className="font-semibold text-gray-800 text-sm">{entry.itemName}</h3>
            {entry.isCompleted ? (
              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">완료</span>
            ) : (
              <span className="text-xs text-gray-400">
                {entry.steps.filter((s) => s.done).length}/{entry.steps.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {entry.steps.map((step, stepIndex) => (
              <button
                key={step.label}
                onClick={() => toggleStep(itemIndex, stepIndex)}
                disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    step.done
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300'
                  }`}
                >
                  {step.done && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-sm ${
                    step.done ? 'text-gray-400 line-through' : 'text-gray-700'
                  }`}
                >
                  {step.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {allCompleted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-green-700 font-semibold">✅ 모든 작업 항목 완료!</p>
          <p className="text-green-600 text-sm mt-1">다음 단계로 진행해주세요.</p>
        </div>
      )}
    </div>
  )
}
