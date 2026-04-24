'use client'

import { useState } from 'react'
import { NotionContentView } from '@/components/admin/content/NotionContentView'

type Tab = '청소꿀팁' | '대표일상'

export default function MediaContentPage() {
  const [tab, setTab] = useState<Tab>('청소꿀팁')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">미디어 콘텐츠</h1>
        <p className="text-sm text-gray-500 mt-1">블로그·SNS 공개 콘텐츠 관리 (노션 실시간 연동)</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['청소꿀팁', '대표일상'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === '청소꿀팁' ? '💡 청소꿀팁' : '🌅 대표일상'}
          </button>
        ))}
      </div>

      {tab === '청소꿀팁' && (
        <NotionContentView
          dbKey="청소꿀팁"
          title="청소꿀팁"
          emoji="💡"
          filterProp="카테고리"
          filterOptions={['주방', '욕실', '거실', '침실', '외부', '기타']}
          columns={[
            { key: '__title', label: '제목', width: 'w-56' },
            { key: '카테고리', label: '카테고리', type: 'badge', width: 'w-24' },
            { key: '난이도', label: '난이도', type: 'badge', width: 'w-20' },
            { key: '본문요약', label: '내용 요약' },
            { key: 'tags', label: '태그', type: 'tag-list', width: 'w-40' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
            { key: '썸네일URL', label: '썸네일', type: 'url', width: 'w-24' },
          ]}
        />
      )}

      {tab === '대표일상' && (
        <NotionContentView
          dbKey="대표일상"
          title="대표일상"
          emoji="🌅"
          filterProp="감정태그"
          filterOptions={['보람', '고민', '감사', '일상', '성취']}
          columns={[
            { key: '__title', label: '제목', width: 'w-56' },
            { key: '날짜', label: '날짜', type: 'date', width: 'w-28' },
            { key: '감정태그', label: '감정', type: 'badge', width: 'w-20' },
            { key: '본문요약', label: '내용 요약' },
            { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
          ]}
        />
      )}
    </div>
  )
}
