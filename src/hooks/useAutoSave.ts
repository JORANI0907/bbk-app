'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions<T> {
  /** 감시할 값. 이 값이 바뀌면 debounce 후 저장 트리거 */
  value: T
  /** 저장 함수. 실패 시 throw */
  save: (value: T) => Promise<void>
  /** debounce 지연 시간(ms). 기본 700ms */
  delay?: number
  /** true일 때만 자동 저장 활성화 (초기 마운트 시 저장 방지 등) */
  enabled?: boolean
  /** 저장 완료 후 'saved' 상태 유지 시간(ms). 기본 1500ms 후 idle */
  savedResetMs?: number
}

/**
 * Phase 2: 필드 변경 시 debounce 후 자동 저장.
 * - 초기 마운트에서는 저장 호출 안 함 (첫 렌더는 서버에서 받은 값이라 저장 불필요)
 * - 언마운트 시 pending timer는 자동 취소 (React StrictMode 대응)
 * - flush() 로 즉시 저장 강제 가능
 */
export function useAutoSave<T>({
  value,
  save,
  delay = 700,
  enabled = true,
  savedResetMs = 1500,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRun = useRef(true)
  const latestValueRef = useRef<T>(value)
  const saveRef = useRef(save)

  useEffect(() => { latestValueRef.current = value }, [value])
  useEffect(() => { saveRef.current = save }, [save])

  const runSave = useCallback(async () => {
    setStatus('saving')
    setError(null)
    try {
      await saveRef.current(latestValueRef.current)
      setStatus('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setStatus('idle'), savedResetMs)
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [savedResetMs])

  useEffect(() => {
    if (!enabled) return
    // 초기 마운트에서는 저장 스킵 (서버에서 받은 값이므로)
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { runSave() }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // value만 감시 — save/delay 변경으로 재저장하지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  /** pending 저장을 즉시 실행 */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      await runSave()
    }
  }, [runSave])

  return { status, error, flush }
}
