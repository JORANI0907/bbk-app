export default function ScheduleLoading() {
  return (
    <div className="px-4 py-5 flex flex-col gap-6 animate-pulse">
      <div className="h-12 bg-blue-50 rounded-2xl border border-blue-100" />

      <div className="flex flex-col gap-3">
        <div className="h-5 w-28 bg-gray-100 rounded" />
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100" />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-5 w-24 bg-gray-100 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100" />
        ))}
      </div>
    </div>
  )
}
