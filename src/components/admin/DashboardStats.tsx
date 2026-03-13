'use client'

import { Card } from '@/components/ui/Card'

interface DashboardStatsProps {
  stats: {
    todayScheduled: number
    inProgress: number
    completed: number
    unassigned: number
  }
}

interface StatCard {
  label: string
  value: number
  icon: string
  colorClass: string
  bgClass: string
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const cards: StatCard[] = [
    {
      label: '오늘 예정',
      value: stats.todayScheduled,
      icon: '📅',
      colorClass: 'text-blue-700',
      bgClass: 'bg-blue-50',
    },
    {
      label: '진행 중',
      value: stats.inProgress,
      icon: '⚙️',
      colorClass: 'text-orange-700',
      bgClass: 'bg-orange-50',
    },
    {
      label: '완료',
      value: stats.completed,
      icon: '✅',
      colorClass: 'text-green-700',
      bgClass: 'bg-green-50',
    },
    {
      label: '미배정',
      value: stats.unassigned,
      icon: '⚠️',
      colorClass: 'text-red-700',
      bgClass: 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 ${card.bgClass} rounded-lg flex items-center justify-center`}>
              <span className="text-lg">{card.icon}</span>
            </div>
          </div>
          <p className={`text-3xl font-bold ${card.colorClass}`}>{card.value}</p>
          <p className="text-sm text-gray-500 mt-1">{card.label}</p>
        </Card>
      ))}
    </div>
  )
}
