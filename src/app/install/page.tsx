'use client'

import { useState } from 'react'

export default function InstallPage() {
  const [copied, setCopied] = useState(false)

  const pageUrl = 'https://app.bbkorea.co.kr/install'
  const androidIntentUrl = `intent://app.bbkorea.co.kr/install#Intent;scheme=https;package=com.android.chrome;end`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{ background: 'linear-gradient(160deg, #0d1117 0%, #0f1923 60%, #0d1117 100%)' }}>

      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="flex flex-col items-center mb-10">
          <img src="/icons/icon-192x192.png" alt="BBK"
            className="w-20 h-20 rounded-3xl object-cover mb-4"
            style={{ boxShadow: '0 0 40px rgba(37,99,235,0.35), 0 8px 32px rgba(0,0,0,0.4)' }} />
          <p className="text-2xl font-black text-white tracking-tight">BBK 공간케어</p>
          <p className="text-white/40 text-sm mt-1">앱 설치 안내</p>
        </div>

        {/* Android */}
        <div className="rounded-2xl p-5 mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🤖</span>
            <p className="text-white font-bold text-sm">Android (갤럭시 등)</p>
          </div>
          <div className="space-y-2">
            <a href={androidIntentUrl}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Chrome으로 열기
            </a>
            <p className="text-white/30 text-xs text-center">버튼이 안 열리면 아래 주소를 복사해 Chrome에서 접속</p>
            <button onClick={handleCopy}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{
                background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)',
              }}>
              {copied ? '✓ 복사됨' : '주소 복사하기'}
            </button>
          </div>
        </div>

        {/* iOS */}
        <div className="rounded-2xl p-5 mb-8"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🍎</span>
            <p className="text-white font-bold text-sm">iPhone / iPad</p>
          </div>
          <div className="space-y-3">
            {[
              { step: '1', text: '우측 하단 ··· 탭 → Safari로 열기' },
              { step: '2', text: '화면 하단 공유 버튼(□↑) 탭' },
              { step: '3', text: '"홈 화면에 추가" → "추가" 탭' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)' }}>
                  {step}
                </span>
                <p className="text-white/70 text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <a href="/login" className="text-white/25 text-xs hover:text-white/40 transition-colors">
            설치 없이 브라우저로 접속 →
          </a>
        </div>

      </div>
    </div>
  )
}
