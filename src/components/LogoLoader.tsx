'use client'

interface LogoLoaderProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LogoLoader({ text = '불러오는 중...', size = 'md' }: LogoLoaderProps) {
  const imgSize = size === 'sm' ? 28 : size === 'lg' ? 56 : 40
  const ringSize = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
  const borderSize = size === 'sm' ? 'border-2' : 'border-[3px]'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="relative flex items-center justify-center">
        {/* Spinning ring */}
        <div
          className={`absolute ${ringSize} rounded-full ${borderSize} border-blue-500 border-t-transparent animate-spin`}
        />
        {/* Logo */}
        <img
          src="/bbk-logo.png"
          alt="BBK"
          style={{ width: imgSize, height: imgSize, objectFit: 'cover' }}
          className="rounded-lg"
        />
      </div>
      {text && <p className={`${textSize} text-gray-400 font-medium`}>{text}</p>}
    </div>
  )
}
