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

const PRIORITY_BADGE: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-500',
  high: 'bg-yellow-100 text-yellow-700',
  urgent: 'bg-red-100 text-red-600',
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
      className="w-full text-left bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-1 active:scale-[0.97] transition-transform shadow-sm"
    >
      <div className="flex items-center gap-1 flex-wrap">
        {item.pinned && <span className="text-[10px] text-blue-600 font-bold">📌</span>}
        {isNew(item.created_at) && (
          <span className="text-[9px] font-bold bg-red-500 text-white px-1 py-0.5 rounded-full leading-none">NEW</span>
        )}
        {PRIORITY_LABEL[item.priority] && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[item.priority]}`}>
            {PRIORITY_LABEL[item.priority]}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
      <p className="text-[10px] text-gray-400">
        {item.type === 'event' && item.event_date
          ? `이벤트: ${item.event_date}`
          : formatShortDate(item.created_at)}
      </p>
    </button>
  )
}

export function NoticesSection({ notices, events }: Props) {
  const [selected, setSelected] = useState<NoticeItem | null>(null)

  if (notices.length === 0 && events.length === 0) return null

  return (
    <>
      <section>
        <h2 className="text-sm font-bold text-gray-800 mb-3">공지 &amp; 이벤트</h2>
        <div className="grid grid-cols-2 gap-3 items-start">
          {/* 왼쪽: 공지 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs">📢</span>
              <span className="text-xs font-bold text-gray-700">공지</span>
              <span className="text-[10px] text-gray-400">({notices.length})</span>
            </div>
            {notices.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4 bg-white rounded-xl border border-gray-100">없음</p>
            ) : (
              notices.map(n => (
                <NoticeCard key={n.id} item={n} onClick={() => setSelected(n)} />
              ))
            )}
          </div>

          {/* 오른쪽: 이벤트 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs">🎉</span>
              <span className="text-xs font-bold text-gray-700">이벤트</span>
              <span className="text-[10px] text-gray-400">({events.length})</span>
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4 bg-white rounded-xl border border-gray-100">없음</p>
            ) : (
              events.map(n => (
                <NoticeCard key={n.id} item={n} onClick={() => setSelected(n)} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="px-5 pb-8 flex flex-col gap-4">
              {/* 배지 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  selected.type === 'notice' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {selected.type === 'notice' ? '공지' : '이벤트'}
                </span>
                {PRIORITY_LABEL[selected.priority] && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PRIORITY_BADGE[selected.priority]}`}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                )}
                {selected.pinned && <span className="text-xs text-blue-600">📌 고정</span>}
              </div>

              {/* 제목 */}
              <h3 className="text-base font-bold text-gray-900 leading-snug">{selected.title}</h3>

              {/* 날짜 */}
              <p className="text-xs text-gray-400 -mt-2">
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.content}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
