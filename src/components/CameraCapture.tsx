'use client'

/**
 * 후면 카메라 강제 웹 캡처 컴포넌트.
 *
 * 배경: HTML <input capture="environment"> 는 삼성 카메라 등 서드파티 앱이
 *  기본 지정되면 무시되어 셀카(전면) 로 열리는 케이스 다수. getUserMedia API 로
 *  브라우저 내부에 카메라 프리뷰를 띄워 후면(환경) 카메라를 100% 강제.
 *
 * 흐름: 마운트 → 후면 카메라 요청 → video 프리뷰 → [촬영] → canvas 캡처 →
 *  Blob → File 변환 → onCapture(file). [재촬영] 시 다시 프리뷰. [X] 로 닫기.
 *
 * fallback: getUserMedia 미지원/권한 거부 시 안내 문구 + 기존 <input capture>
 *  파일 선택으로 우회.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Camera, RotateCcw } from 'lucide-react'

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
}

type Status = 'requesting' | 'streaming' | 'captured' | 'denied' | 'unsupported'

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackInputRef = useRef<HTMLInputElement | null>(null)

  const [status, setStatus] = useState<Status>('requesting')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string>('')

  // 카메라 스트림 시작
  const startStream = async () => {
    setStatus('requesting')
    setPreviewUrl(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStatus('streaming')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorDetail(msg)
      // NotAllowedError / SecurityError = 권한 거부. 나머지 = 미지원 취급.
      if (/NotAllowed|Denied|Security/i.test(msg)) {
        setStatus('denied')
      } else {
        setStatus('unsupported')
      }
    }
  }

  // 스트림 정리
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    startStream()
    return () => { stopStream() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 촬영 — canvas 로 현재 프레임 캡처 후 File 로 변환
  const handleShoot = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setStatus('captured')
      // 캡처 후 스트림 정지 (배터리/발열 절약)
      stopStream()
      // 확인 버튼에서 사용할 blob 을 임시 보관
      ;(canvas as HTMLCanvasElement & { __lastBlob?: Blob }).__lastBlob = blob
    }, 'image/jpeg', 0.92)
  }

  const handleConfirm = () => {
    const canvas = canvasRef.current as (HTMLCanvasElement & { __lastBlob?: Blob }) | null
    const blob = canvas?.__lastBlob
    if (!blob) return
    const file = new File([blob], `capture-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    onCapture(file)
    onClose()
  }

  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    startStream()
  }

  const handleClose = () => {
    stopStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    onClose()
  }

  // fallback (권한 거부/미지원) 에서 기존 <input capture> 사용
  const handleFallbackPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onCapture(file)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black flex flex-col" onClick={e => e.stopPropagation()}>
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={handleClose} className="p-2 -ml-2" aria-label="닫기">
          <X size={22} />
        </button>
        <p className="text-sm font-medium">사진 촬영 (후면)</p>
        <div className="w-8" />
      </div>

      {/* 본문 */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {status === 'requesting' && (
          <p className="text-white/70 text-sm">카메라 권한을 요청 중…</p>
        )}

        {status === 'streaming' && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain bg-black"
          />
        )}

        {status === 'captured' && previewUrl && (
          <img src={previewUrl} alt="촬영 미리보기" className="w-full h-full object-contain bg-black" />
        )}

        {(status === 'denied' || status === 'unsupported') && (
          <div className="max-w-xs mx-auto text-center px-4 space-y-3">
            <p className="text-white/90 text-sm leading-relaxed">
              {status === 'denied'
                ? '카메라 권한이 거부되었습니다.\n브라우저 설정에서 카메라 권한을 허용해주세요.'
                : '이 브라우저는 카메라 API 를 지원하지 않습니다.\n기본 사진 선택으로 진행해주세요.'}
            </p>
            {errorDetail && (
              <p className="text-white/40 text-[10px] break-all">{errorDetail}</p>
            )}
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium cursor-pointer">
              <Camera size={16} />
              사진 선택
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFallbackPick}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      {status === 'streaming' && (
        <div className="flex items-center justify-center px-4 py-6">
          <button
            onClick={handleShoot}
            className="w-16 h-16 rounded-full bg-white ring-4 ring-white/30 active:scale-95 transition-transform"
            aria-label="촬영"
          />
        </div>
      )}

      {status === 'captured' && (
        <div className="flex items-center justify-around px-4 py-5">
          <button
            onClick={handleRetake}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/40 text-white text-sm"
          >
            <RotateCcw size={16} />
            재촬영
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 rounded-lg bg-white text-black text-sm font-semibold"
          >
            이 사진 사용
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
