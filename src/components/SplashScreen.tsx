'use client'

import { useState, useEffect } from 'react'

export function SplashScreen() {
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'hold' | 'exit'>('hidden')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('splashShown')) return

    setPhase('enter')
    const t1 = setTimeout(() => setPhase('hold'), 500)
    const t2 = setTimeout(() => setPhase('exit'), 1300)
    const t3 = setTimeout(() => {
      sessionStorage.setItem('splashShown', '1')
      setPhase('hidden')
    }, 2100)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'hidden') return null

  const overlayStyle: React.CSSProperties = {
    opacity: phase === 'exit' ? 0 : 1,
    transition: phase === 'exit' ? 'opacity 0.7s ease-out' : 'opacity 0.3s ease-in',
  }

  const logoStyle: React.CSSProperties = phase === 'exit'
    ? {
        transform: 'scale(0.08) translate(-42vw, -42vh)',
        opacity: 0,
        transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.8, 0.2), opacity 0.5s ease-out 0.2s',
      }
    : phase === 'enter'
    ? {
        transform: 'scale(0.6)',
        opacity: 0,
        transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }
    : {
        transform: 'scale(1)',
        opacity: 1,
        transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
      style={overlayStyle}
    >
      <div className="flex flex-col items-center" style={logoStyle}>
        <img
          src="/bbk-logo.png"
          alt="BBK 공간케어"
          className="rounded-2xl shadow-2xl"
          style={{ width: 96, height: 96, objectFit: 'cover' }}
        />
        <p className="font-black text-2xl text-gray-900 mt-4 tracking-tight">BBK 공간케어</p>
        <p className="text-xs text-gray-400 mt-1.5 font-medium tracking-widest uppercase">Professional Care Service</p>
      </div>
    </div>
  )
}
