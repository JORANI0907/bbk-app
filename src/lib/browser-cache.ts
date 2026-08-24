/**
 * 브라우저 localStorage 기반 응답 캐시.
 *
 * 목적: 재접속 시 지난번 응답을 즉시 화면에 뿌리고, 백그라운드 fetch 로 최신값 교체.
 *   → 관리자가 페이지 진입 시 로딩 대기 시간을 체감상 0 에 가깝게 만든다.
 *
 * 안전:
 *   - SSR 환경(window 없음)에서는 no-op.
 *   - 예외 발생 시(quota 초과·직렬화 실패 등) 조용히 무시 → 캐시 실패가 앱을 깨뜨리지 않음.
 *   - TTL 지난 캐시는 자동으로 stale 판정.
 *
 * 사용:
 *   const cached = readCache<{ customers: Customer[] }>('customers-list', 60 * 60 * 1000)
 *   if (cached) setCustomers(cached.customers)
 *   const fresh = await fetch(...).then(r => r.json())
 *   writeCache('customers-list', fresh)
 *   setCustomers(fresh.customers)
 */

const NAMESPACE = 'bbk-cache-v1'

function key(id: string): string {
  return `${NAMESPACE}:${id}`
}

interface CacheEntry<T> {
  savedAt: number
  data: T
}

/** 캐시 읽기. maxAgeMs 를 넘긴 항목은 null 반환. */
export function readCache<T>(id: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key(id))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry || typeof entry.savedAt !== 'number') return null
    if (Date.now() - entry.savedAt > maxAgeMs) return null
    return entry.data
  } catch {
    return null
  }
}

/** 캐시 쓰기. */
export function writeCache<T>(id: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry<T> = { savedAt: Date.now(), data }
    window.localStorage.setItem(key(id), JSON.stringify(entry))
  } catch {
    // quota 초과 시 조용히 무시
  }
}

/** 특정 캐시 삭제. */
export function clearCache(id: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(key(id)) } catch {}
}

/** 전체 캐시 삭제 (로그아웃 훅에서 호출). */
export function clearAllCache(): void {
  if (typeof window === 'undefined') return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(`${NAMESPACE}:`)) toRemove.push(k)
    }
    for (const k of toRemove) window.localStorage.removeItem(k)
  } catch {}
}
