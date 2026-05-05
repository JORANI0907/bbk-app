'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface NoticeItem {
  id: string
  title: string
  content: string
  type: 'notice' | 'event'
  priority: 'normal' | 'high' | 'urgent'
  pinned: boolean
  event_date: string | null
  image_url: string | null
  created_at: string
}

interface Props {
  notices: NoticeItem[]
  events: NoticeItem[]
}

type TabType = 'all' | 'notice' | 'event'

const PRIORITY_BADGE: Record<string, string> = {
  normal: 'bg-surface-sunken text-text-secondary',
  high: 'bg-yellow-100 text-yellow-700',
  urgent: 'bg-state-danger-bg text-state-danger',
}
const PRIORITY_LABEL: Record<string, string> = {
  normal: '', high: '중요', urgent: '긴급',
}

const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
function isNew(createdAt: string) {
  return new Date(createdAt) > sevenDaysAgo
}

function formatShortDate(iso: string) {
  return format(new Date(iso), 'M.d', { locale: ko })
}

function NoticeCard({ item, onClick }: { item: NoticeItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface rounded-2xl border border-border-subtle p-3 flex flex-col gap-1 active:scale-[0.97] transition-transform shadow-flat"
    >
      <div className="flex items-center gap-1 flex-wrap">
        {item.pinned && (
          <span className="text-[10px] font-bold text-brand-600 border border-brand-200 px-1 py-0.5 rounded leading-none">고정</span>
        )}
        {isNew(item.created_at) && (
          <span className="text-[9px] font-bold bg-state-danger text-white px-1 py-0.5 rounded-full leading-none">NEW</span>
        )}
        {PRIORITY_LABEL[item.priority] && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[item.priority]}`}>
            {PRIORITY_LABEL[item.priority]}
          </span>
        )}
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ml-auto ${
          item.type === 'notice' ? 'bg-brand-100 text-brand-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {item.type === 'notice' ? '공지' : '이벤트'}
        </span>
      </div>
      <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-snug">{item.title}</p>
      <p className="text-[10px] text-text-tertiary">
        {item.type === 'event' && item.event_date
          ? `이벤트: ${item.event_date}`
          : formatShortDate(item.created_at)}
      </p>
    </button>
  )
}

export function NoticesSection({ notices, events }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [selected, setSelected] = useState<NoticeItem | null>(null)

  const allItems = [...notices, ...events].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const tabItems: Record<TabType, NoticeItem[]> = {
    all: allItems,
    notice: notices,
    event: events,
  }

  const currentItems = tabItems[activeTab]
  const totalCount = allItems.length

  if (totalCount === 0) return null

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: totalCount },
    { key: 'notice', label: '공지', count: notices.length },
    { key: 'event', label: '이벤트', count: events.length },
  ]

  return (
    <>
      <section>
        <h2 className="text-sm font-bold text-text-primary mb-3">공지 &amp; 이벤트</h2>

        {/* 탭 */}
        <div className="flex gap-2 mb-3">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-sunken text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                activeTab === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-border text-text-tertiary'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* 목록 */}
        {currentItems.length === 0 ? (
          <div className="flex items-center justify-center py-10 bg-surface rounded-2xl border border-border-subtle">
            <p className="text-sm text-text-tertiary">등록된 내용이 없습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {currentItems.map(item => (
              <NoticeCard key={item.id} item={item} onClick={() => setSelected(item)} />
            ))}
          </div>
        )}
      </section>

      {/* 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-surface rounded-t-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>

            <div className="px-5 pb-8 flex flex-col gap-4">
              {/* 배지 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  selected.type === 'notice' ? 'bg-brand-100 text-brand-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {selected.type === 'notice' ? '공지' : '이벤트'}
                </span>
                {PRIORITY_LABEL[selected.priority] && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PRIORITY_BADGE[selected.priority]}`}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                )}
                {selected.pinned && (
                  <span className="text-xs text-brand-600 font-medium border border-brand-200 px-2 py-0.5 rounded-full">고정</span>
                )}
              </div>

              {/* 제목 */}
              <h3 className="text-base font-bold text-text-primary leading-snug">{selected.title}</h3>

              {/* 날짜 */}
              <p className="text-xs text-text-tertiary -mt-2">
                {selected.type === 'event' && selected.event_date
                  ? `이벤트 날짜: ${selected.event_date} · `
                  : ''}
                등록일: {format(new Date(selected.created_at), 'yyyy년 M월 d일', { locale: ko })}
              </p>

              {/* 이미지 */}
              {selected.image_url && (
                <img
                  src={selected.image_url}
                  alt={selected.title}
                  className="w-full rounded-xl object-cover max-h-52"
                />
              )}

              {/* 본문 */}
              <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{selected.content}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
