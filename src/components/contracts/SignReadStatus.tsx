'use client'

export interface ReadStatusItem {
  key: string
  label: string
  done: boolean
}

interface SignReadStatusProps {
  items: ReadStatusItem[]
}

/**
 * 확인 현황 — 손으로 체크할 수 없고, 해당 문서를 열어 끝까지 읽고 확인을 눌러야 자동으로 체크된다.
 */
export default function SignReadStatus({ items }: SignReadStatusProps) {
  const doneCount = items.filter((i) => i.done).length
  return (
    <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">확인 현황</p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">{doneCount} / {items.length}</span>
      </div>
      <p className="text-xs text-text-tertiary break-keep">각 항목을 열어 끝까지 읽고 확인을 누르면 자동으로 체크됩니다. 직접 체크할 수는 없습니다.</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-3">
            <input type="checkbox" checked={i.done} readOnly disabled className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0" aria-label={i.label} />
            <span className={`text-sm break-keep ${i.done ? 'text-text-primary' : 'text-text-tertiary'}`}>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
