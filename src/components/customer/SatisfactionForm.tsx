'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'

interface Props {
  scheduleId: string
  onSubmit: () => void
}

export function SatisfactionForm({ scheduleId, onSubmit }: Props) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('별점을 선택해주세요.')
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
        const { error } = await supabase
          .from('closing_checklists')
          .update({
            customer_rating: rating,
            customer_comment: comment.trim() || null,
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('closing_checklists').insert({
          schedule_id: scheduleId,
          customer_rating: rating,
          customer_comment: comment.trim() || null,
          garbage_disposal: false,
          gas_valve_check: false,
          electric_check: false,
          security_check: false,
          door_lock_check: false,
        })
        if (error) throw error
      }

      toast.success('소중한 평가 감사합니다!')
      onSubmit()
    } catch (err) {
      console.error('만족도 저장 실패:', err)
      toast.error('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayRating = hovered > 0 ? hovered : rating

  const ratingLabels: Record<number, string> = {
    1: '매우 불만족',
    2: '불만족',
    3: '보통',
    4: '만족',
    5: '매우 만족',
  }

  return (
    <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-base font-bold text-text-primary">서비스 만족도 평가</h3>
        <p className="text-sm text-text-secondary mt-1">이번 서비스는 어떠셨나요?</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="text-4xl transition-transform active:scale-90"
              aria-label={`${star}점`}
            >
              {star <= displayRating ? '⭐' : '☆'}
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <span className="text-sm font-medium text-brand-600">
            {ratingLabels[displayRating]}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-text-primary">
          추가 의견 <span className="text-text-tertiary font-normal">(선택)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="서비스에 대한 의견을 자유롭게 작성해주세요."
          rows={4}
          maxLength={500}
          className="w-full px-4 py-3 text-sm border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-text-tertiary text-right">{comment.length}/500</p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || rating === 0}
        isLoading={isSubmitting}
        variant="primary"
        className="w-full py-4 font-bold rounded-2xl active:scale-[0.98]"
      >
        평가 제출하기
      </Button>
    </div>
  )
}
