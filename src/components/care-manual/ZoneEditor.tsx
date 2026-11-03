'use client'

/**
 * 구역 하나의 편집 패널 — 작업 묶음 카드 + 번호 매긴 작업 항목 (드래그로 순서 변경)
 *   항목은 접힌 줄(제목·칩)로 보이고 하나만 펼쳐 집중한다.
 */

import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { ChevronDown, GripVertical, ImageIcon, Plus, Trash2 } from 'lucide-react'
import type { CareManualGroupV2, CareManualItemV2, CareManualZoneV2 } from '@/types/care-manual'
import { emptyGroup, emptyItem } from '@/types/care-manual'
import { ZONE_THEME, FREQUENCY_LABEL } from './zone-theme'
import { ItemEditor } from './ItemEditor'
import styles from './care-manual.module.css'

interface Props {
  zone: CareManualZoneV2
  zones: CareManualZoneV2[]
  uploadingKey: string | null
  onChange: (next: CareManualZoneV2) => void
  onMoveItem: (itemId: string, fromGroupId: string, toZoneId: string) => void
  onUpload: (groupId: string, itemId: string, files: File[]) => Promise<void>
  onRemoveImage: (groupId: string, itemId: string, url: string) => void
  onPreview: (url: string) => void
}

const titleCls = 'w-full bg-transparent text-base font-bold text-text-primary placeholder:text-text-tertiary placeholder:font-semibold focus:outline-none'
const smallCls = 'w-full bg-transparent text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none'

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function ZoneEditor({ zone, zones, uploadingKey, onChange, onMoveItem, onUpload, onRemoveImage, onPreview }: Props) {
  const t = ZONE_THEME[zone.color]
  const [openItemId, setOpenItemId] = useState<string | null>(null)

  const patchGroup = (groupId: string, patch: Partial<CareManualGroupV2>) =>
    onChange({ ...zone, groups: zone.groups.map(g => (g.id === groupId ? { ...g, ...patch } : g)) })

  const patchItem = (groupId: string, itemId: string, patch: Partial<CareManualItemV2>) =>
    onChange({
      ...zone,
      groups: zone.groups.map(g => g.id !== groupId ? g : { ...g, items: g.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)) }),
    })

  const addGroup = () => onChange({ ...zone, groups: [...zone.groups, emptyGroup()] })
  const removeGroup = (groupId: string) => {
    const g = zone.groups.find(x => x.id === groupId)
    if (g && g.items.some(i => i.title || i.instructions || i.images.length) && !confirm(`"${g.title || '제목 없는 작업 묶음'}" 과 안의 작업 ${g.items.length}개를 삭제할까요?`)) return
    onChange({ ...zone, groups: zone.groups.filter(x => x.id !== groupId) })
  }
  const addItem = (groupId: string) => {
    const item = emptyItem()
    patchGroup(groupId, { items: [...(zone.groups.find(g => g.id === groupId)?.items ?? []), item] })
    setOpenItemId(item.id)
  }
  const removeItem = (groupId: string, itemId: string) => {
    const g = zone.groups.find(x => x.id === groupId)
    const i = g?.items.find(x => x.id === itemId)
    if (i && (i.title || i.instructions || i.images.length) && !confirm(`"${i.title || '제목 없는 작업'}" 을 삭제할까요?`)) return
    patchGroup(groupId, { items: (g?.items ?? []).filter(x => x.id !== itemId) })
  }

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result
    if (!destination) return
    if (type === 'GROUP') {
      if (source.index === destination.index) return
      onChange({ ...zone, groups: reorder(zone.groups, source.index, destination.index) })
      return
    }
    const fromId = source.droppableId.replace('items:', '')
    const toId = destination.droppableId.replace('items:', '')
    if (fromId === toId) {
      if (source.index === destination.index) return
      const g = zone.groups.find(x => x.id === fromId)
      if (g) patchGroup(fromId, { items: reorder(g.items, source.index, destination.index) })
      return
    }
    const from = zone.groups.find(x => x.id === fromId)
    const to = zone.groups.find(x => x.id === toId)
    if (!from || !to) return
    const moved = from.items[source.index]
    const toItems = [...to.items]
    toItems.splice(destination.index, 0, moved)
    onChange({
      ...zone,
      groups: zone.groups.map(g => g.id === fromId ? { ...g, items: g.items.filter((_, i) => i !== source.index) } : g.id === toId ? { ...g, items: toItems } : g),
    })
  }

  let running = 0

  return (
    <div className="flex flex-col gap-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`groups:${zone.id}`} type="GROUP">
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-4">
              {zone.groups.map((g, gi) => (
                <Draggable key={g.id} draggableId={g.id} index={gi}>
                  {(dragProvided, snapshot) => (
                    <section
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`${styles.reveal} relative overflow-hidden rounded-2xl border bg-surface transition-shadow ${
                        snapshot.isDragging ? 'border-brand-300 shadow-pop' : 'border-border-subtle shadow-soft'
                      }`}
                      style={{ ...dragProvided.draggableProps.style, animationDelay: `${gi * 60}ms` }}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
                      <header className="flex items-start gap-2 pl-5 pr-3 pt-3 pb-2">
                        <button type="button" {...dragProvided.dragHandleProps} className="mt-1.5 cursor-grab text-text-tertiary hover:text-text-secondary active:cursor-grabbing" aria-label="작업 묶음 순서 이동">
                          <GripVertical size={16} />
                        </button>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <input value={g.title} onChange={e => patchGroup(g.id, { title: e.target.value })} placeholder="작업 묶음 제목 (예: 후드·덕트)" className={titleCls} />
                          <input value={g.summary ?? ''} onChange={e => patchGroup(g.id, { summary: e.target.value || undefined })} placeholder="한 줄 요약 (선택)" className={smallCls} />
                        </div>
                        <button type="button" onClick={() => removeGroup(g.id)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-rose-50 hover:text-rose-600" aria-label="작업 묶음 삭제">
                          <Trash2 size={15} />
                        </button>
                      </header>

                      <Droppable droppableId={`items:${g.id}`} type="ITEM">
                        {itemsProvided => (
                          <ol ref={itemsProvided.innerRef} {...itemsProvided.droppableProps} className="divide-y divide-border-subtle border-t border-border-subtle">
                            {g.items.map((item, ii) => {
                              running += 1
                              const index = running
                              const open = openItemId === item.id
                              const uploading = uploadingKey === `${g.id}-${item.id}`
                              return (
                                <Draggable key={item.id} draggableId={item.id} index={ii}>
                                  {(ip, isnap) => (
                                    <li ref={ip.innerRef} {...ip.draggableProps} className={`bg-surface ${isnap.isDragging ? 'shadow-card rounded-xl' : ''}`}>
                                      <div className="flex items-center gap-2 pl-4 pr-3 py-2">
                                        <button type="button" {...ip.dragHandleProps} className="cursor-grab text-text-tertiary hover:text-text-secondary active:cursor-grabbing" aria-label="작업 순서 이동">
                                          <GripVertical size={14} />
                                        </button>
                                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${t.badge}`}>{index}</span>
                                        <input
                                          value={item.title}
                                          onChange={e => patchItem(g.id, item.id, { title: e.target.value })}
                                          onFocus={() => setOpenItemId(item.id)}
                                          placeholder="작업 제목 (예: 후드 필터 분리 세척)"
                                          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-primary placeholder:font-medium placeholder:text-text-tertiary focus:outline-none"
                                        />
                                        <div className="hidden items-center gap-1 sm:flex">
                                          {item.frequency && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-text-secondary">{FREQUENCY_LABEL[item.frequency]}</span>}
                                          {item.images.length > 0 && (
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-text-secondary"><ImageIcon size={11} /> {item.images.length}</span>
                                          )}
                                          {item.caution && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" title="주의사항 있음" />}
                                        </div>
                                        <button type="button" onClick={() => setOpenItemId(open ? null : item.id)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-sunken" aria-label={open ? '접기' : '펼치기'}>
                                          <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                                        </button>
                                        <button type="button" onClick={() => removeItem(g.id, item.id)} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-rose-50 hover:text-rose-600" aria-label="작업 삭제">
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                      <div className={`${styles.expand} ${open ? styles.expandOpen : ''}`}>
                                        <div className={styles.expandInner}>
                                          {open && (
                                            <ItemEditor
                                              item={item}
                                              zones={zones}
                                              currentZoneId={zone.id}
                                              uploading={uploading}
                                              onChange={patch => patchItem(g.id, item.id, patch)}
                                              onUpload={files => onUpload(g.id, item.id, files)}
                                              onRemoveImage={url => onRemoveImage(g.id, item.id, url)}
                                              onMoveToZone={zoneId => { setOpenItemId(null); onMoveItem(item.id, g.id, zoneId) }}
                                              onPreview={onPreview}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </li>
                                  )}
                                </Draggable>
                              )
                            })}
                            {itemsProvided.placeholder}
                            <li className="pl-12 pr-3 py-2">
                              <button type="button" onClick={() => addItem(g.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50">
                                <Plus size={14} /> 작업 추가
                              </button>
                            </li>
                          </ol>
                        )}
                      </Droppable>
                    </section>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button
        type="button"
        onClick={addGroup}
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-4 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      >
        <Plus size={16} /> 작업 묶음 추가
      </button>
    </div>
  )
}
