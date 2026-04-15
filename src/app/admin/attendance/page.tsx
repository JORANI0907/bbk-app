'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { MonthNavigator } from '@/components/MonthNavigator'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
} from '@/lib/googleDrive'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string
  worker_id: string
  worker_name: string
  work_date: string
  clock_in: string | null
  clock_out: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  clock_in_photo_url: string | null
  clock_out_photo_url: string | null
  status: string | null
  notes: string | null
  worker?: { id: string; name: string; employment_type: string } | null
}

interface Worker {
  id: string
  name: string
  employment_type: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: string | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return '-'
  const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  if (diff <= 0) return '-'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}시간 ${m}분`
}

function getWeekday(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatLocationText(lat: number | null, lng: number | null): string {
  if (!lat || !lng) return '-'
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko`,
      { headers: { 'User-Agent': 'BBK-App/1.0' } }
    )
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    const json = await res.json() as { display_name?: string }
    return json.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

// ─── Camera Component ─────────────────────────────────────────────────────────

type CameraPhase = 'preview' | 'captured'

interface CameraProps {
  onCapture: (blob: Blob, dataUrl: string) => void
  onCancel: () => void
}

function CameraCapture({ onCapture, onCancel }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<CameraPhase>('preview')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flashEnabled, setFlashEnabled] = useState(false)

  const startStream = useCallback(async (facing: 'environment' | 'user') => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setCameraError('카메라 접근 권한이 필요합니다.')
    }
  }, [])

  useEffect(() => {
    startStream('environment')
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [startStream])

  const toggleCamera = () => {
    const next: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    setFlashEnabled(false)
    startStream(next)
  }

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !flashEnabled
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setFlashEnabled(next)
    } catch {
      toast.error('이 기기에서는 플래시를 지원하지 않습니다.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = canvas.toDataURL('image/jpeg', 0.85)
      setCapturedBlob(blob)
      setPreviewUrl(url)
      setPhase('captured')
      streamRef.current?.getTracks().forEach(t => t.stop())
    }, 'image/jpeg', 0.85)
  }

  const retake = () => {
    setPhase('preview')
    setPreviewUrl(null)
    setCapturedBlob(null)
    startStream(facingMode)
  }

  const confirm = () => {
    if (capturedBlob && previewUrl) onCapture(capturedBlob, previewUrl)
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-4xl">📷</div>
        <p className="text-sm text-red-500">{cameraError}</p>
        <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-video">
        {phase === 'preview' && (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
        {phase === 'captured' && previewUrl && (
          <img src={previewUrl} alt="촬영된 사진" className="w-full h-full object-cover" />
        )}
        {/* 카메라 조작 버튼 (미리보기 중에만 표시) */}
        {phase === 'preview' && (
          <div className="absolute top-2 right-2 flex flex-col gap-2">
            <button
              onClick={toggleFlash}
              title={flashEnabled ? '플래시 끄기' : '플래시 켜기'}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-md transition-colors ${
                flashEnabled ? 'bg-yellow-400 text-black' : 'bg-black/60 text-white'
              }`}
            >
              ⚡
            </button>
            <button
              onClick={toggleCamera}
              title="카메라 전환"
              className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center text-lg shadow-md"
            >
              🔄
            </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-2">
        {phase === 'preview' ? (
          <>
            <button onClick={onCancel}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold">
              취소
            </button>
            <button onClick={capture}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold">
              촬영
            </button>
          </>
        ) : (
          <>
            <button onClick={retake}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold">
              다시 촬영
            </button>
            <button onClick={confirm}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold">
              사용
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Worker Clock View ────────────────────────────────────────────────────────

type ClockPhase =
  | 'idle'
  | 'confirm'
  | 'camera'
  | 'locating'
  | 'submitting'
  | 'done'
  | 'cancel_in_confirm'   // 출근 기록 삭제 확인
  | 'cancel_out_confirm'  // 퇴근 기록만 삭제 확인

interface WorkerInfo {
  id: string
  name: string
  role: string
}

interface WorkerClockViewProps {
  workerInfo: WorkerInfo
}

function WorkerClockView({ workerInfo }: WorkerClockViewProps) {
  // KST 기준 날짜/시간 계산 (UTC+9)
  const getKSTDate = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const getKSTHour = () => new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const kstToday = getKSTDate()

  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(kstToday)
  const [flow, setFlow] = useState<'clock_in' | 'clock_out' | null>(null)
  const [phase, setPhase] = useState<ClockPhase>('idle')
  const [elapsed, setElapsed] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const todayKST = getKSTDate()
      const kstHour = getKSTHour()

      // 야간 근무 대응: 12시 이전이면 전날 기록도 조회
      const prevKST = kstHour < 12
        ? new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : null

      const monthsToFetch = new Set([todayKST.slice(0, 7)])
      if (prevKST) monthsToFetch.add(prevKST.slice(0, 7))

      const allRecords: AttendanceRecord[] = []
      for (const month of Array.from(monthsToFetch)) {
        const res = await fetch(`/api/admin/attendance?month=${month}`)
        if (!res.ok) throw new Error('출퇴근 기록 조회 실패')
        const json = await res.json()
        allRecords.push(...(json.data ?? []))
      }

      const mine = allRecords.filter(r => r.worker_id === workerInfo.id)
      setMonthRecords([...mine].sort((a, b) => b.work_date.localeCompare(a.work_date)))
    } catch {
      toast.error('출퇴근 기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [workerInfo.id])

  useEffect(() => { fetchData() }, [fetchData])

  // 선택한 날짜의 기록 (야간 작업 대응: 오늘 선택 + 12시 이전 → 전날 미완료 기록 우선)
  const selectedRecord: AttendanceRecord | null = (() => {
    const kstHour = getKSTHour()
    if (selectedDate === kstToday && kstHour < 12) {
      const prevKST = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const active = monthRecords.find(r => r.work_date === prevKST && r.clock_in && !r.clock_out) ?? null
      if (active) return active
    }
    return monthRecords.find(r => r.work_date === selectedDate) ?? null
  })()

  // Elapsed timer when clocked in but not out
  useEffect(() => {
    if (!selectedRecord?.clock_in || selectedRecord?.clock_out) return
    const update = () => {
      const diff = Date.now() - new Date(selectedRecord.clock_in!).getTime()
      setElapsed(Math.floor(diff / 1000))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [selectedRecord])

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const startFlow = (type: 'clock_in' | 'clock_out') => {
    setFlow(type)
    setPhase('confirm')  // 확인 단계 먼저
  }

  const handleCapture = (blob: Blob) => {
    setPhase('locating')
    submitAttendance(blob)
  }

  const submitAttendance = async (blob: Blob) => {
    setPhase('submitting')

    try {
      // 1. 위치 정보 획득
      let lat: number | null = null
      let lng: number | null = null
      await new Promise<void>(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve() },
          () => resolve(),
          { timeout: 8000, maximumAge: 0 }
        )
      })

      // 2. 사진 업로드
      let photoUrl: string | null = null
      if (blob) {
        const fd = new FormData()
        fd.append('photo', blob, 'photo.jpg')
        fd.append('type', flow!)
        fd.append('worker_name', workerInfo.name)
        fd.append('date', selectedDate)

        const uploadRes = await fetch('/api/admin/attendance/photo', { method: 'POST', body: fd })
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json() as { url?: string }
          photoUrl = uploadJson.url ?? null
        }
      }

      const now = new Date().toISOString()

      if (flow === 'clock_in') {
        const body: Record<string, unknown> = {
          worker_id: workerInfo.id,
          worker_name: workerInfo.name,
          work_date: selectedDate,
          clock_in: now,
        }
        if (lat !== null) { body.clock_in_lat = lat; body.clock_in_lng = lng }
        if (photoUrl) body.clock_in_photo_url = photoUrl

        const res = await fetch('/api/admin/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) { toast.error(json.error || '출근 기록 실패'); setPhase('idle'); return }
        toast.success('출근 완료!')
      } else if (flow === 'clock_out' && selectedRecord) {
        const body: Record<string, unknown> = { id: selectedRecord.id, clock_out: now }
        if (lat !== null) { body.clock_out_lat = lat; body.clock_out_lng = lng }
        if (photoUrl) body.clock_out_photo_url = photoUrl

        const res = await fetch('/api/admin/attendance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) { toast.error(json.error || '퇴근 기록 실패'); setPhase('idle'); return }
        toast.success('퇴근 완료!')
      }

      await fetchData()
      setPhase('done')
      setTimeout(() => setPhase('idle'), 2000)
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
      setPhase('idle')
    } finally {
      setFlow(null)
    }
  }

  const cancelFlow = () => {
    setFlow(null)
    setPhase('idle')
  }

  // 출근 기록 삭제 (전체 레코드 삭제)
  const handleDeleteClockIn = async () => {
    if (!selectedRecord) return
    setPhase('submitting')
    try {
      const res = await fetch(`/api/admin/attendance?id=${selectedRecord.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '출근 취소 실패'); setPhase('idle'); return }
      toast.success('출근 기록이 취소되었습니다.')
      await fetchData()
      setPhase('idle')
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
      setPhase('idle')
    }
  }

  // 퇴근 기록만 삭제 (출근은 유지, clock_out → null)
  const handleDeleteClockOut = async () => {
    if (!selectedRecord) return
    setPhase('submitting')
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRecord.id,
          clock_out: null,
          clock_out_lat: null,
          clock_out_lng: null,
          clock_out_photo_url: null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '퇴근 취소 실패'); setPhase('idle'); return }
      toast.success('퇴근 기록이 취소되었습니다.')
      await fetchData()
      setPhase('idle')
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
      setPhase('idle')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">불러오는 중...</div>
    )
  }

  const isClockedIn = !!selectedRecord?.clock_in
  const isClockedOut = !!selectedRecord?.clock_out

  // 확인 단계 (취소 가능)
  if (phase === 'confirm') {
    return (
      <div className="max-w-sm mx-auto px-4 pt-8">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {flow === 'clock_in' ? '🟢 출근 처리하시겠습니까?' : '🔴 퇴근 처리하시겠습니까?'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              })}
            </p>
            {flow === 'clock_out' && selectedRecord?.clock_in && (
              <p className="text-xs text-gray-400 mt-0.5">출근 {formatTime(selectedRecord.clock_in)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPhase('camera')}
              className={`flex-1 py-3 text-sm font-bold rounded-xl ${
                flow === 'clock_in' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white'
              }`}
            >
              {flow === 'clock_in' ? '출근 확정' : '퇴근 확정'}
            </button>
            <button
              onClick={cancelFlow}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Camera open
  if (phase === 'camera') {
    return (
      <div className="max-w-sm mx-auto px-4 pt-8">
        <p className="text-center text-sm font-semibold text-gray-700 mb-4">
          {flow === 'clock_in' ? '출근 사진 촬영' : '퇴근 사진 촬영'}
        </p>
        <CameraCapture onCapture={handleCapture} onCancel={cancelFlow} />
      </div>
    )
  }

  // Processing
  if (phase === 'locating' || phase === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-sm text-gray-500 font-medium">
          {phase === 'locating' ? '위치 확인 중...' : '기록 저장 중...'}
        </p>
      </div>
    )
  }

  // Done flash
  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl">✓</div>
        <p className="text-sm text-green-600 font-semibold">완료!</p>
      </div>
    )
  }

  // 출근 기록 취소 확인
  if (phase === 'cancel_in_confirm') {
    return (
      <div className="max-w-sm mx-auto px-4 pt-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">출근 기록을 취소하시겠습니까?</p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} 출근 기록이 삭제됩니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteClockIn}
              className="flex-1 py-3 bg-red-500 text-white text-sm font-bold rounded-xl"
            >
              출근 취소
            </button>
            <button
              onClick={() => setPhase('idle')}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 퇴근 기록 취소 확인
  if (phase === 'cancel_out_confirm') {
    return (
      <div className="max-w-sm mx-auto px-4 pt-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">퇴근 기록을 취소하시겠습니까?</p>
            <p className="text-xs text-gray-500 mt-1">
              퇴근 기록만 삭제됩니다. 출근 기록({formatTime(selectedRecord?.clock_in ?? null)})은 유지됩니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteClockOut}
              className="flex-1 py-3 bg-red-500 text-white text-sm font-bold rounded-xl"
            >
              퇴근 취소
            </button>
            <button
              onClick={() => setPhase('idle')}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main UI
  return (
    <div className="px-4 pb-6 flex flex-col gap-5">
      {/* 헤더 */}
      <div className="text-center pt-2">
        <p className="text-xs text-gray-400 font-medium">
          {new Date().toLocaleDateString('ko-KR', {
            timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
          })}
        </p>
        <p className="text-2xl font-black text-gray-900 mt-1">{workerInfo.name}</p>
      </div>

      {/* 날짜 선택 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <label className="block text-xs text-gray-400 mb-1.5">근무 날짜 선택</label>
        <input
          type="date"
          value={selectedDate}
          max={kstToday}
          onChange={(e) => { setSelectedDate(e.target.value); setPhase('idle') }}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1.5">
          야간 근무(22시~익일 06시)의 경우 실제 출근한 날짜를 선택해 주세요
        </p>
      </div>

      {/* 상태 카드 */}
      {!isClockedIn && (
        <div className="bg-gray-50 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-4xl">🏢</div>
          <p className="text-sm text-gray-500 text-center">출근 기록이 없습니다.<br />출근 버튼을 눌러 출근하세요.</p>
          <button
            onClick={() => startFlow('clock_in')}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl text-base font-bold active:scale-95 transition-all shadow-lg shadow-blue-100"
          >
            🟢 출근하기
          </button>
        </div>
      )}

      {isClockedIn && !isClockedOut && (
        <div className="bg-gray-50 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl">✅</div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">출근 시각</p>
            <p className="text-lg font-bold text-gray-800">{formatTime(selectedRecord!.clock_in)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">근무 경과</p>
            <p className="text-2xl font-mono font-bold text-blue-600">{formatElapsed(elapsed)}</p>
          </div>
          <button
            onClick={() => startFlow('clock_out')}
            className="w-full py-4 bg-gray-800 text-white rounded-2xl text-base font-bold active:scale-95 transition-all"
          >
            🔴 퇴근하기
          </button>
          <button
            onClick={() => setPhase('cancel_in_confirm')}
            className="text-xs text-red-400 underline underline-offset-2"
          >
            출근 기록 취소
          </button>
        </div>
      )}

      {isClockedIn && isClockedOut && (
        <div className="bg-gray-50 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center text-4xl">🌙</div>
          <p className="text-sm font-semibold text-gray-700">출퇴근 완료</p>
          <div className="w-full flex gap-3">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-1">출근</p>
              <p className="text-sm font-bold text-gray-800">{formatTime(selectedRecord!.clock_in)}</p>
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-1">퇴근</p>
              <p className="text-sm font-bold text-gray-800">{formatTime(selectedRecord!.clock_out)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            근무 시간 {formatDuration(selectedRecord!.clock_in, selectedRecord!.clock_out)}
          </p>
          <button
            onClick={() => setPhase('cancel_out_confirm')}
            className="text-xs text-red-400 underline underline-offset-2"
          >
            퇴근 기록 취소
          </button>
        </div>
      )}

      {/* 이번 달 출퇴근 내역 */}
      {monthRecords.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">
            {new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long' })} 출퇴근 내역
          </h2>
          <div className="flex flex-col divide-y divide-gray-50">
            {monthRecords.map((record) => {
              const d = new Date(record.work_date + 'T12:00:00')
              const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
              const done = !!record.clock_out
              return (
                <div key={record.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-14 shrink-0">
                      <p className="text-sm font-bold text-gray-800">{d.getMonth() + 1}월 {d.getDate()}일</p>
                      <p className="text-xs text-gray-400">{dayLabel}</p>
                    </div>
                    <div className="flex-1 flex gap-3 text-xs">
                      <div>
                        <span className="text-gray-400">출근 </span>
                        <span className="font-semibold text-blue-600">{formatTime(record.clock_in)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">퇴근 </span>
                        <span className={`font-semibold ${done ? 'text-gray-700' : 'text-gray-300'}`}>
                          {formatTime(record.clock_out)}
                        </span>
                      </div>
                    </div>
                    {done ? (
                      <span className="text-xs text-green-500 font-medium">완료</span>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedDate(record.work_date)
                          setPhase('idle')
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="px-2.5 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg"
                      >
                        퇴근
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Table View ─────────────────────────────────────────────────────────

function AdminTableView() {
  const today = new Date()
  const [yearMonth, setYearMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorkerId, setSelectedWorkerId] = useState('')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Drive 폴더 설정
  const [driveFolderName, setDriveFolderName] = useState('')
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveApisReady, setDriveApisReady] = useState(false)
  const [selectingFolder, setSelectingFolder] = useState(false)

  useEffect(() => {
    fetch('/api/admin/workers')
      .then(r => r.json())
      .then(j => setWorkers(j.workers ?? []))
      .catch(() => {})
    // Drive 폴더 설정 로드
    fetch('/api/admin/app-settings?key=attendance_drive_folder')
      .then(r => r.json())
      .then(j => {
        if (j.setting?.value) {
          const parsed = JSON.parse(j.setting.value) as { id?: string; name?: string }
          if (parsed.id) { setDriveFolderId(parsed.id); setDriveFolderName(parsed.name ?? parsed.id) }
        }
      })
      .catch(() => {})
    // Google API 로드
    loadGoogleAPIs().then(() => setDriveApisReady(true)).catch(() => {})
  }, [])

  // user gesture context 유지 위해 non-async, requestGoogleToken() 즉시 호출
  function handlePickDriveFolder() {
    if (!driveApisReady) { toast.error('Google API 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return }
    setSelectingFolder(true)
    let capturedToken = ''
    requestGoogleToken()
      .then(token => { capturedToken = token; return openFolderPicker(token) })
      .then(picked => {
        if (!picked) return null
        return resolveFolder(picked, capturedToken)
      })
      .then(async folder => {
        if (!folder) return
        const res = await fetch('/api/admin/app-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'attendance_drive_folder',
            value: JSON.stringify({ id: folder.id, name: folder.name }),
          }),
        })
        if (!res.ok) throw new Error('저장 실패')
        setDriveFolderId(folder.id)
        setDriveFolderName(folder.name)
        toast.success(`📁 "${folder.name}" 저장 위치로 설정됐습니다.`)
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Drive 연결 실패'))
      .finally(() => setSelectingFolder(false))
  }

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month: yearMonth })
      if (selectedWorkerId) params.set('worker_id', selectedWorkerId)
      const res = await fetch(`/api/admin/attendance?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setRecords(json.data ?? [])
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [yearMonth, selectedWorkerId])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const startNoteEdit = (rec: AttendanceRecord) => {
    setEditingNoteId(rec.id)
    setNoteValue(rec.notes ?? '')
  }

  const saveNote = async (id: string) => {
    setSavingNote(true)
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes: noteValue }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }
      toast.success('메모 저장됨')
      setEditingNoteId(null)
      fetchRecords()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSavingNote(false)
    }
  }

  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = getDaysInMonth(year, month)

  const recordsByDate = records.reduce<Record<string, AttendanceRecord[]>>((acc, rec) => {
    const d = rec.work_date
    return { ...acc, [d]: [...(acc[d] ?? []), rec] }
  }, {})

  const showNameColumn = !selectedWorkerId

  return (
    <div>
      {/* Drive 사진 저장 위치 설정 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-blue-700 shrink-0">📁 사진 저장 위치</span>
        {driveFolderName ? (
          <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-1.5 flex-1 min-w-[160px]">
            <span className="text-base shrink-0">📂</span>
            <span className="text-xs text-blue-700 font-medium truncate">{driveFolderName}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 flex-1">저장 위치가 설정되지 않았습니다.</span>
        )}
        <button
          onClick={handlePickDriveFolder}
          disabled={selectingFolder || !driveApisReady}
          className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
        >
          {selectingFolder ? (
            <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />선택 중...</>
          ) : (
            <>{driveFolderName ? '📁 위치 변경' : '📁 폴더 선택'}</>
          )}
        </button>
        {driveFolderId && (
          <a
            href={`https://drive.google.com/drive/folders/${driveFolderId}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline shrink-0"
          >
            열기 →
          </a>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MonthNavigator value={yearMonth} onChange={setYearMonth} />

        <select
          value={selectedWorkerId}
          onChange={e => setSelectedWorkerId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto"
        >
          <option value="">전체 직원</option>
          {workers.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap min-w-[110px]">날짜</th>
                  {showNameColumn && (
                    <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap min-w-[72px]">이름</th>
                  )}
                  <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap min-w-[100px]">출근</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap min-w-[100px]">퇴근</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap min-w-[90px]">근무시간</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[140px]">메모</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = String(i + 1).padStart(2, '0')
                  const dateStr = `${yearMonth}-${day}`
                  const dayRecs = recordsByDate[dateStr] ?? []
                  const weekday = getWeekday(dateStr)
                  const isWeekend = weekday === 0 || weekday === 6
                  const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][weekday]
                  const isToday = dateStr === new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

                  if (dayRecs.length === 0) {
                    return (
                      <tr key={dateStr} className={`border-b border-gray-50 ${isWeekend ? 'bg-red-50/30' : ''}`}>
                        <td className={`px-3 py-2.5 font-medium text-sm whitespace-nowrap ${weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                          {i + 1}일({dayLabel})
                          {isToday && <span className="ml-1 text-[10px] bg-blue-600 text-white px-1 py-0.5 rounded-full">오늘</span>}
                        </td>
                        {showNameColumn && <td className="px-3 py-2.5 text-gray-200">-</td>}
                        <td className="px-3 py-2.5 text-gray-200">-</td>
                        <td className="px-3 py-2.5 text-gray-200">-</td>
                        <td className="px-3 py-2.5 text-gray-200">-</td>
                        <td className="px-3 py-2.5 text-gray-200">-</td>
                      </tr>
                    )
                  }

                  return dayRecs.map((rec, idx) => (
                    <tr key={rec.id} className={`border-b border-gray-50 ${isWeekend ? 'bg-red-50/30' : 'hover:bg-gray-50/50'}`}>
                      {idx === 0 && (
                        <td
                          className={`px-3 py-2.5 font-medium align-top text-sm whitespace-nowrap ${weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-gray-700'}`}
                          rowSpan={dayRecs.length}
                        >
                          {i + 1}일({dayLabel})
                          {isToday && <span className="ml-1 text-[10px] bg-blue-600 text-white px-1 py-0.5 rounded-full">오늘</span>}
                        </td>
                      )}
                      {showNameColumn && (
                        <td className="px-3 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                          {rec.worker?.name ?? rec.worker_name ?? '-'}
                        </td>
                      )}

                      {/* 출근 */}
                      <td className="px-3 py-2.5">
                        {rec.clock_in ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-medium text-gray-800 text-sm">{formatTime(rec.clock_in)}</span>
                              {rec.clock_in_photo_url && (
                                <a href={rec.clock_in_photo_url} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-700 text-xs">📷</a>
                              )}
                            </div>
                            {(rec.clock_in_lat || rec.clock_in_lng) && (
                              <span className="text-[10px] text-gray-400 leading-tight">
                                {formatLocationText(rec.clock_in_lat, rec.clock_in_lng)}
                              </span>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-sm">-</span>}
                      </td>

                      {/* 퇴근 */}
                      <td className="px-3 py-2.5">
                        {rec.clock_out ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-medium text-gray-800 text-sm">{formatTime(rec.clock_out)}</span>
                              {rec.clock_out_photo_url && (
                                <a href={rec.clock_out_photo_url} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-700 text-xs">📷</a>
                              )}
                            </div>
                            {(rec.clock_out_lat || rec.clock_out_lng) && (
                              <span className="text-[10px] text-gray-400 leading-tight">
                                {formatLocationText(rec.clock_out_lat, rec.clock_out_lng)}
                              </span>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-sm">-</span>}
                      </td>

                      {/* 근무시간 */}
                      <td className="px-3 py-2.5 text-gray-600 text-sm whitespace-nowrap">
                        {formatDuration(rec.clock_in, rec.clock_out)}
                      </td>

                      {/* 메모 */}
                      <td className="px-3 py-2.5 min-w-[140px]">
                        {editingNoteId === rec.id ? (
                          <div className="flex gap-1 items-center">
                            <input
                              value={noteValue}
                              onChange={e => setNoteValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveNote(rec.id) }}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="메모 입력"
                              autoFocus
                            />
                            <button onClick={() => saveNote(rec.id)} disabled={savingNote}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                              저장
                            </button>
                            <button onClick={() => setEditingNoteId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startNoteEdit(rec)}
                            className="text-left w-full text-xs text-gray-600 hover:text-blue-600 group"
                          >
                            {rec.notes
                              ? <span>{rec.notes}</span>
                              : <span className="text-gray-300 group-hover:text-blue-400">메모 추가...</span>
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [userInfo, setUserInfo] = useState<{ id: string; name: string; role: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(j => setUserInfo({ id: j.id ?? '', name: j.name ?? '', role: j.role ?? '' }))
      .catch(() => {})
  }, [])

  if (!userInfo) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">불러오는 중...</div>
    )
  }

  const isWorker = userInfo.role === 'worker'

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">출퇴근 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isWorker ? '출퇴근을 기록하세요.' : '직원별 출퇴근 기록을 조회하고 관리합니다.'}
        </p>
      </div>

      {isWorker ? (
        <WorkerClockView workerInfo={userInfo} />
      ) : (
        <AdminTableView />
      )}
    </div>
  )
}
