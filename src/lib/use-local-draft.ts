'use client'

/**
 * 브라우저(localStorage)에 작성 중인 내용을 남기는 훅.
 * 화면을 오가거나 다른 메뉴를 보고 돌아와도 입력이 유지된다. 서버에는 저장하지 않는다.
 * 사생활 모드·저장 차단 환경에서는 조용히 메모리로만 동작한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useLocalDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [restored, setRestored] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) { setValue(JSON.parse(raw) as T); setRestored(true) }
    } catch {
      /* 저장소 사용 불가 — 기본값 유지 */
    }
  }, [key])

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try { window.localStorage.setItem(key, JSON.stringify(resolved)) } catch { /* 무시 */ }
      return resolved
    })
  }, [key])

  const clear = useCallback(() => {
    try { window.localStorage.removeItem(key) } catch { /* 무시 */ }
    setValue(initial)
    setRestored(false)
  }, [key, initial])

  return { value, update, clear, restored, isLoaded: loadedRef.current }
}
