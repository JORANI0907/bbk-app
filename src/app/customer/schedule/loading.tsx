export default function ScheduleLoading() {
  return (
    <div className="px-4 py-5 flex flex-col gap-6 animate-pulse">
      <div className="h-12 bg-brand-50 rounded-2xl border border-brand-100" />

      <div className="flex flex-col gap-3">
        <div className="h-5 w-28 bg-surface-sunken rounded" />
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-surface rounded-2xl border border-border-subtle" />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-5 w-24 bg-surface-sunken rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-2xl border border-border-subtle" />
        ))}
      </div>
    </div>
  )
}
