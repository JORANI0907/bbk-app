export default function WorkerLoading() {
  return (
    <div className="px-4 py-5 flex flex-col gap-4 animate-pulse">
      {/* Greeting card skeleton */}
      <div className="h-36 bg-blue-100 rounded-2xl" />

      {/* Schedule cards */}
      {[1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-28 bg-white rounded-2xl border border-gray-100" />
          <div className="h-10 bg-blue-50 rounded-xl" />
        </div>
      ))}
    </div>
  )
}
