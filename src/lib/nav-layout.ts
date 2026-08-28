import type { NavItem, NavChild, NavGroup, NavLeaf } from './admin-nav-config'

// ─── 저장 스키마 ───────────────────────────────────────────────
// DB의 admin_nav_layout.layout 컬럼에 저장되는 JSON 구조.

export interface SavedLeaf {
  kind: 'leaf'
  id: string  // NavLeaf.id 참조
}

export interface SavedGroup {
  kind: 'group'
  id: string             // NavGroup.id 참조
  children: string[]     // NavChild.href 배열 (순서대로)
}

export type SavedItem = SavedLeaf | SavedGroup

export interface NavLayout {
  version: 1
  items: SavedItem[]
}

// ─── 저장 스키마 검증 ──────────────────────────────────────────
// API 라우트 PUT 진입 시 사용. 부적합 데이터는 즉시 400.

export function validateNavLayout(input: unknown): NavLayout | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (obj.version !== 1) return null
  if (!Array.isArray(obj.items)) return null

  const items: SavedItem[] = []
  for (const raw of obj.items) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    if (item.kind === 'leaf') {
      if (typeof item.id !== 'string' || !item.id) return null
      items.push({ kind: 'leaf', id: item.id })
    } else if (item.kind === 'group') {
      if (typeof item.id !== 'string' || !item.id) return null
      if (!Array.isArray(item.children)) return null
      const children: string[] = []
      for (const c of item.children) {
        if (typeof c !== 'string' || !c) return null
        children.push(c)
      }
      items.push({ kind: 'group', id: item.id, children })
    } else {
      return null
    }
  }
  return { version: 1, items }
}

// ─── 원본 → 저장 스키마 변환 (기본값 생성용) ───────────────────

export function extractLayoutFromItems(items: NavItem[]): NavLayout {
  const out: SavedItem[] = []
  for (const item of items) {
    if (item.type === 'leaf') {
      out.push({ kind: 'leaf', id: item.id })
    } else {
      out.push({
        kind: 'group',
        id: item.id,
        children: item.children.map(c => c.href),
      })
    }
  }
  return { version: 1, items: out }
}

// ─── 핵심: 저장 레이아웃 + 원본 코드 병합 ─────────────────────
// 원칙:
//  - 저장 순서 우선
//  - 저장 데이터에 없는 신규 항목은 원래 위치(그룹)에 자동 삽입
//  - 저장 데이터에만 있고 원본에 없는 항목(삭제된 탭)은 무시
//  - 크로스 그룹 이동은 저장된 그룹으로 이동해서 렌더링
// 이 병합을 통해 앱 코드가 업데이트되어 새 메뉴가 추가돼도
// 관리자의 커스텀 순서가 유지되면서 신규 탭도 자동으로 노출됨.

export function mergeNavLayout(
  baseItems: NavItem[],
  savedLayout: NavLayout | null | undefined
): NavItem[] {
  if (!savedLayout) return baseItems

  // 인덱스 구축
  const leafById = new Map<string, NavLeaf>()
  const groupById = new Map<string, NavGroup>()
  const childByHref = new Map<string, NavChild>()
  const childOriginalGroupId = new Map<string, string>()

  interface OriginalSlot { kind: 'leaf' | 'group'; id: string }
  const originalTopOrder: OriginalSlot[] = []

  for (const item of baseItems) {
    if (item.type === 'leaf') {
      leafById.set(item.id, item)
      originalTopOrder.push({ kind: 'leaf', id: item.id })
    } else {
      groupById.set(item.id, item)
      originalTopOrder.push({ kind: 'group', id: item.id })
      for (const child of item.children) {
        childByHref.set(child.href, child)
        childOriginalGroupId.set(child.href, item.id)
      }
    }
  }

  const usedLeaves = new Set<string>()
  const usedGroups = new Set<string>()
  const usedChildren = new Set<string>()

  const result: NavItem[] = []

  // 1. 저장 레이아웃 순서대로 배치
  for (const saved of savedLayout.items) {
    if (saved.kind === 'leaf') {
      const leaf = leafById.get(saved.id)
      if (leaf && !usedLeaves.has(leaf.id)) {
        result.push(leaf)
        usedLeaves.add(leaf.id)
      }
      continue
    }
    // group
    const group = groupById.get(saved.id)
    if (!group || usedGroups.has(group.id)) continue

    const children: NavChild[] = []
    for (const href of saved.children) {
      const child = childByHref.get(href)
      if (child && !usedChildren.has(href)) {
        children.push(child)
        usedChildren.add(href)
      }
    }
    result.push({ ...group, children })
    usedGroups.add(group.id)
  }

  // 2. 저장 레이아웃에 없는 원본 항목들을 원래 순서대로 추가
  for (const slot of originalTopOrder) {
    if (slot.kind === 'leaf') {
      if (usedLeaves.has(slot.id)) continue
      const leaf = leafById.get(slot.id)
      if (!leaf) continue
      result.push(leaf)
      usedLeaves.add(slot.id)
      continue
    }
    if (usedGroups.has(slot.id)) continue
    const group = groupById.get(slot.id)
    if (!group) continue
    const remaining = group.children.filter(c => !usedChildren.has(c.href))
    result.push({ ...group, children: remaining })
    usedGroups.add(slot.id)
    for (const c of remaining) usedChildren.add(c.href)
  }

  // 3. 어떤 그룹에도 못 들어간 신규 서브탭은 원래 소속 그룹 끝에 추가.
  //    (예: 새로 추가된 서브탭이 저장 데이터에 없을 때)
  for (const [href, child] of childByHref) {
    if (usedChildren.has(href)) continue
    const originalGroupId = childOriginalGroupId.get(href)
    if (!originalGroupId) continue
    const target = result.find(
      (it): it is NavGroup => it.type === 'group' && it.id === originalGroupId,
    )
    if (!target) continue
    target.children.push(child)
    usedChildren.add(href)
  }

  return result
}
