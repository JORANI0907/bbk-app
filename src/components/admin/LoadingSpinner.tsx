export function LoadingSpinner({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg animate-bbk-wobble"
          style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
        >
          <span className="text-white text-2xl font-black">B</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 animate-pulse">{text}</p>
    </div>
  )
}
