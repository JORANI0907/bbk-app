export default function CustomerLoading() {
  return (
    <div className="px-4 py-5 flex flex-col gap-6 animate-pulse">
      {/* D-day card skeleton */}
      <div className="h-44 bg-brand-100 rounded-3xl" />

      {/* Subscription card skeleton */}
      <div className="bg-surface rounded-2xl border border-border-subtle p-5">
        <div className="h-4 w-24 bg-surface-sunken rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-brand-50 rounded-xl" />
          <div className="h-16 bg-surface-sunken rounded-xl" />
        </div>
      </div>

      {/* Recent services skeleton */}
      <div className="flex flex-col gap-3">
        <div className="h-5 w-32 bg-surface-sunken rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-surface rounded-2xl border border-border-subtle" />
        ))}
      </div>
    </div>
  )
}
