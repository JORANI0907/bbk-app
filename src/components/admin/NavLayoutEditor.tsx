'use client'

import { useCallback, useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical, X, RotateCcw } from 'lucide-react'
import { COLOR_MAP, type NavGroup, type NavItem, type NavLeaf } from '@/lib/admin-nav-config'
import { extractLayoutFromItems, type NavLayout } from '@/lib/nav-layout'

interface Props {
  open: boolean
  onClose: () => void
  initialItems: NavItem[]      // 현재 사이드바에 렌더링 중인(병합된) 순서
  defaultItems: NavItem[]      // 원본 순서 (기본값 복원용)
  onSaved: (nextLayout: NavLayout) => void
}

// ─── 유틸 ─────────────────────────────────────────────────────

// react-list 재정렬 (immutable)
function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = list.slice()
  const [removed] = result.splice(startIndex, 1)
  result.splice(endIndex, 0, removed)
  return result
}

const ROOT_DROPPABLE = 'root'
const GROUP_DROPPABLE_PREFIX = 'group:'

// ─── 컴포넌트 ─────────────────────────────────────────────────

export function NavLayoutEditor({ open, onClose, initialItems, defaultItems, onSaved }: Props) {
  const [items, setItems] = useState<NavItem[]>(initialItems)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // open 될 때마다 최신 initialItems로 리셋
  useEffect(() => {
    if (open) {
      setItems(initialItems)
      setError(null)
    }
  }, [open, initialItems])

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, type } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    // 최상위 재정렬 (그룹/리프 자리 이동)
    if (type === 'ROOT') {
      setItems(prev => reorder(prev, source.index, destination.index))
      return
    }

    // 서브탭 이동 (같은 그룹 내부 또는 다른 그룹으로)
    if (type === 'CHILD') {
      const srcGroupId = source.droppableId.slice(GROUP_DROPPABLE_PREFIX.length)
      const dstGroupId = destination.droppableId.slice(GROUP_DROPPABLE_PREFIX.length)

      setItems(prev => {
        const next = prev.map(it => (it.type === 'group' ? { ...it, children: [...it.children] } : it))
        const srcGroup = next.find((it): it is NavGroup => it.type === 'group' && it.id === srcGroupId)
        const dstGroup = next.find((it): it is NavGroup => it.type === 'group' && it.id === dstGroupId)
        if (!srcGroup || !dstGroup) return prev
        const [moved] = srcGroup.children.splice(source.index, 1)
        dstGroup.children.splice(destination.index, 0, moved)
        return next
      })
    }
  }, [])

  const handleReset = useCallback(() => {
    if (!confirm('기본 순서로 되돌립니다. 계속할까요?')) return
    setItems(defaultItems)
  }, [defaultItems])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const layout = extractLayoutFromItems(items)
      const res = await fetch('/api/admin/nav-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '저장 실패' }))
        throw new Error(data.error ?? '저장 실패')
      }
      onSaved(layout)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [items, onSaved, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-surface rounded-2xl shadow-modal">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-bold text-text-primary">탭 순서 편집</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              최상위 항목과 서브탭 모두 드래그로 순서를 바꿀 수 있어요. 서브탭은 다른 그룹으로 이동도 가능합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-sunken hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={ROOT_DROPPABLE} type="ROOT">
              {(rootProvided) => (
                <div ref={rootProvided.innerRef} {...rootProvided.droppableProps} className="space-y-2">
                  {items.map((item, index) =>
                    item.type === 'leaf'
                      ? <LeafRow key={`leaf:${item.id}`} leaf={item} index={index} />
                      : <GroupRow key={`group:${item.id}`} group={item} index={index} />
                  )}
                  {rootProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-50"
          >
            <RotateCcw size={14} />
            기본값 복원
          </button>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-state-danger mr-2">{error}</span>}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────

function LeafRow({ leaf, index }: { leaf: NavLeaf; index: number }) {
  const c = leaf.colorKey ? COLOR_MAP[leaf.colorKey] : null
  return (
    <Draggable draggableId={`leaf:${leaf.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${snapshot.isDragging ? 'bg-surface shadow-pop border-brand-300' : 'bg-surface-sunken border-border-subtle'}`}
        >
          <span
            {...provided.dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-text-tertiary p-1"
            aria-label="드래그 핸들"
          >
            <GripVertical size={16} />
          </span>
          <span className={`${c?.icon ?? 'text-text-secondary'}`}>{leaf.icon}</span>
          <span className="text-sm font-semibold text-text-primary">{leaf.label}</span>
        </div>
      )}
    </Draggable>
  )
}

function GroupRow({ group, index }: { group: NavGroup; index: number }) {
  const c = group.colorKey ? COLOR_MAP[group.colorKey] : null
  return (
    <Draggable draggableId={`group:${group.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-xl border ${snapshot.isDragging ? 'bg-surface shadow-pop border-brand-300' : 'bg-surface border-border-subtle'}`}
        >
          {/* 그룹 헤더 */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${c?.activeBg ?? 'bg-surface-sunken'}`}>
            <span
              {...provided.dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-text-tertiary p-1"
              aria-label="그룹 드래그 핸들"
            >
              <GripVertical size={16} />
            </span>
            <span className={`${c?.icon ?? 'text-text-secondary'}`}>{group.icon}</span>
            <span className={`text-sm font-bold ${c?.activeText ?? 'text-text-primary'}`}>{group.label}</span>
          </div>

          {/* 하위 서브탭 (Droppable) */}
          <Droppable droppableId={`${GROUP_DROPPABLE_PREFIX}${group.id}`} type="CHILD">
            {(childProvided, childSnapshot) => (
              <div
                ref={childProvided.innerRef}
                {...childProvided.droppableProps}
                className={`px-3 py-2 space-y-1 min-h-[44px] ${childSnapshot.isDraggingOver ? 'bg-brand-50' : ''}`}
              >
                {group.children.length === 0 && !childSnapshot.isDraggingOver && (
                  <p className="text-xs text-text-tertiary italic px-2 py-1">비어 있음</p>
                )}
                {group.children.map((child, idx) => (
                  <Draggable key={child.href} draggableId={`child:${child.href}`} index={idx}>
                    {(chProvided, chSnapshot) => (
                      <div
                        ref={chProvided.innerRef}
                        {...chProvided.draggableProps}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${chSnapshot.isDragging ? 'bg-surface shadow-card border-brand-300' : 'bg-surface-sunken border-border-subtle'}`}
                      >
                        <span
                          {...chProvided.dragHandleProps}
                          className="cursor-grab active:cursor-grabbing text-text-tertiary"
                          aria-label="서브탭 드래그 핸들"
                        >
                          <GripVertical size={14} />
                        </span>
                        <span className="text-sm text-text-primary">{child.label}</span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {childProvided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      )}
    </Draggable>
  )
}
