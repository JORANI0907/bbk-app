export function LoadingSpinner({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <img
          src="/bbk-logo.png"
          alt="BBK 공간케어"
          className="w-16 h-16 rounded-2xl shadow-lg animate-bbk-wobble"
          style={{ objectFit: 'cover' }}
        />
      </div>
      <p className="text-sm text-gray-400 animate-pulse">{text}</p>
    </div>
  )
}
