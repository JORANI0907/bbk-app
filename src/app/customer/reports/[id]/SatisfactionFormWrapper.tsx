'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SatisfactionForm } from '@/components/customer/SatisfactionForm'

interface Props {
  scheduleId: string
}

export function SatisfactionFormWrapper({ scheduleId }: Props) {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    setSubmitted(true)
    router.refresh()
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
        <p className="text-green-700 font-semibold">평가해주셔서 감사합니다! 🙏</p>
      </div>
    )
  }

  return <SatisfactionForm scheduleId={scheduleId} onSubmit={handleSubmit} />
}
