'use client'

import { useState, useEffect } from 'react'
import { useInstallPWA } from '@/hooks/useInstallPWA'

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

// 카카오톡 인앱브라우저 → Android: Chrome으로 열기 안내
function KakaoAndroidScreen() {
  const pageUrl = 'https://app.bbkorea.co.kr/install'
  const intentUrl = `intent://${pageUrl.replace('https://', '')}#Intent;scheme=https;package=com.android.chrome;end`
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API 실패 시 무시
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1923 100%)' }}>
      <img src="/bbk-logo.png" alt="BBK" className="w-20 h-20 rounded-3xl object-cover mb-6"
        style={{ boxShadow: '0 0 40px rgba(37,99,235,0.35)' }} />
      <p className="text-xl font-black text-white mb-2">Chrome에서 설치해주세요</p>
      <p className="text-white/50 text-sm mb-8 leading-relaxed">
        카카오톡에서는 앱 설치가 불가합니다.<br />
        아래 방법 중 하나를 따라주세요.
      </p>

      <div className="w-full max-w-xs space-y-3">
        {/* 방법 1: intent 링크로 Chrome 직접 열기 */}
        <div className="rounded-2xl p-4 text-left"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-white/60 text-xs font-semibold mb-2">방법 1 — Chrome 앱으로 열기</p>
          <a href={intentUrl}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Chrome으로 열기
          </a>
        </div>

        {/* 방법 2: URL 복사 후 직접 접속 */}
        <div className="rounded-2xl p-4 text-left"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-white/60 text-xs font-semibold mb-2">방법 2 — 주소 복사 후 Chrome에서 접속</p>
          <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2.5 mb-2">
            <span className="text-white/50 text-xs flex-1 font-mono">app.bbkorea.co.kr/install</span>
          </div>
          <button onClick={handleCopy}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-colors"
            style={{ background: copied ? '#16a34a' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {copied ? '✓ 복사됨' : '주소 복사하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 카카오톡 인앱브라우저 → iOS: Safari 열기 안내
function KakaoIOSScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1923 100%)' }}>
      <img src="/bbk-logo.png" alt="BBK" className="w-20 h-20 rounded-3xl object-cover mb-6"
        style={{ boxShadow: '0 0 40px rgba(37,99,235,0.35)' }} />
      <p className="text-xl font-black text-white mb-2">Safari에서 열어주세요</p>
      <p className="text-white/50 text-sm mb-8 leading-relaxed">
        카카오톡에서는 앱 설치가 불가합니다.<br />
        아래 방법으로 Safari에서 열어주세요.
      </p>
      <div className="w-full max-w-xs rounded-2xl p-5 space-y-4 text-left"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {[
          { step: '1', text: '우측 하단 ··· 버튼 탭' },
          { step: '2', text: '"Safari로 열기" 선택' },
          { step: '3', text: 'Safari에서 "홈 화면에 추가" 탭' },
        ].map(({ step, text }) => (
          <div key={step} className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)' }}>
              {step}
            </span>
            <p className="text-white/80 text-sm">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function IOSGuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: '1', text: 'Safari 브라우저로 app.bbkorea.co.kr 접속' },
    {
      icon: '2',
      text: '하단 공유 버튼 탭',
      sub: '화면 하단 가운데 □↑ 아이콘',
    },
    { icon: '3', text: '"홈 화면에 추가" 선택' },
    { icon: '4', text: '"추가" 버튼 탭 → 완료!' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden text-white mb-2"
        style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <img src="/bbk-logo.png" alt="BBK" className="w-6 h-6 rounded-md object-cover" />
            <p className="font-semibold text-sm">iPhone / iPad 설치 방법</p>
          </div>
          <button onClick={onClose}
            className="text-white/40 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)' }}>
                {step.icon}
              </span>
              <div>
                <p className="text-white/85 text-sm leading-relaxed">{step.text}</p>
                {step.sub && <p className="text-white/40 text-xs mt-0.5">{step.sub}</p>}
              </div>
            </div>
          ))}

          <div className="pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-white/30 text-xs">* Safari 브라우저에서만 설치 가능합니다.</p>
            <p className="text-white/30 text-xs mt-1">* Chrome 앱에서는 설치가 지원되지 않습니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AlreadyInstalledScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1923 100%)' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
        <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-2xl font-black text-white mb-3">이미 설치되었어요!</p>
      <p className="text-white/50 text-sm leading-relaxed mb-8">
        BBK 앱이 홈 화면에 설치되어 있습니다.<br />
        홈 화면에서 앱 아이콘을 탭해 실행하세요.
      </p>
      <a href="/login"
        className="px-8 py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-[0.97]"
        style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}>
        앱 열기
      </a>
    </div>
  )
}

export default function InstallPage() {
  const { install, installPrompt, isInstalled, isIOS, isKakaoTalk, isAndroid } = useInstallPWA()
  const [installing, setInstalling] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleInstall = async () => {
    setInstalling(true)
    await install()
    setInstalling(false)
  }

  if (!mounted) return null

  if (isInstalled) return <AlreadyInstalledScreen />

  // 카카오톡 인앱 브라우저: PWA 설치 불가 → 외부 브라우저로 유도
  if (isKakaoTalk && isAndroid) return <KakaoAndroidScreen />
  if (isKakaoTalk && isIOS) return <KakaoIOSScreen />

  const canDirectInstall = !!installPrompt && !isIOS
  const canIOSInstall = isIOS

  const features = [
    '일정 · 배정 · 공지 한 곳에서 확인',
    '빠른 로그인, 앱처럼 빠른 실행',
    '오프라인에서도 최근 데이터 열람',
    '푸시 알림으로 실시간 업무 수신',
  ]

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #0d1117 0%, #0f1923 60%, #0d1117 100%)' }}>

      {/* 상단 장식 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
        }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <div className="w-full max-w-sm">

          {/* 로고 */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-5">
              <img src="/bbk-logo.png" alt="BBK"
                className="w-20 h-20 rounded-3xl object-cover"
                style={{ boxShadow: '0 0 40px rgba(37,99,235,0.35), 0 8px 32px rgba(0,0,0,0.4)' }} />
              <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: '#22c55e', boxShadow: '0 2px 8px rgba(34,197,94,0.5)' }}>
                <CheckIcon />
              </div>
            </div>
            <p className="text-2xl font-black text-white tracking-tight">BBK 공간케어</p>
            <p className="text-white/40 text-sm mt-1">홈 화면에 추가하기</p>
          </div>

          {/* 핵심 기능 목록 */}
          <div className="rounded-2xl p-5 mb-6 space-y-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'rgba(37,99,235,0.2)', color: '#60a5fa' }}>
                  <CheckIcon />
                </div>
                <p className="text-white/70 text-sm">{f}</p>
              </div>
            ))}
          </div>

          {/* 설치 버튼 영역 */}
          {canDirectInstall && (
            <div className="space-y-3">
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full py-4 rounded-2xl text-white font-black text-base transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 disabled:opacity-60"
                style={{
                  background: installing ? '#334155' : 'linear-gradient(135deg, #2563eb, #4f46e5)',
                  boxShadow: installing ? 'none' : '0 4px 24px rgba(37,99,235,0.45)',
                }}
              >
                {installing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    설치 중...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    홈 화면에 설치하기
                  </>
                )}
              </button>
              <p className="text-white/25 text-xs text-center">
                설치 팝업이 뜨면 &ldquo;설치&rdquo; 버튼을 탭하세요
              </p>
            </div>
          )}

          {canIOSInstall && (
            <div className="space-y-3">
              <button
                onClick={() => setShowIOSGuide(true)}
                className="w-full py-4 rounded-2xl text-white font-black text-base transition-all active:scale-[0.97] flex items-center justify-center gap-2.5"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                  boxShadow: '0 4px 24px rgba(14,165,233,0.4)',
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M12 18.5l-3-3m3 3l3-3m-3 3V6.5m-7 5.5a9 9 0 1118 0 9 9 0 01-18 0z" />
                </svg>
                iPhone 설치 방법 보기
              </button>
              <p className="text-white/25 text-xs text-center">
                Safari 브라우저에서만 설치 가능합니다
              </p>
            </div>
          )}

          {!canDirectInstall && !canIOSInstall && (
            <div className="rounded-2xl p-5 text-center space-y-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-white/60 text-sm font-semibold">설치하는 방법</p>
              <div className="space-y-2 text-left">
                {[
                  '크롬: 주소창 오른쪽 ⋮ 메뉴 → "앱 설치"',
                  'Android 크롬: 주소창 아래 설치 배너 탭',
                  'iPhone: Safari → □↑ → 홈 화면에 추가',
                ].map((t, i) => (
                  <p key={i} className="text-white/40 text-xs flex gap-2">
                    <span className="text-blue-400 flex-shrink-0">›</span>{t}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 로그인 링크 */}
          <div className="mt-8 text-center">
            <a href="/login" className="text-white/30 text-xs hover:text-white/50 transition-colors">
              설치 없이 브라우저로 접속 →
            </a>
          </div>

        </div>
      </div>

      <p className="text-center text-white/20 text-xs pb-8">© 2025 BBK Korea</p>

      {showIOSGuide && <IOSGuideModal onClose={() => setShowIOSGuide(false)} />}
    </div>
  )
}
