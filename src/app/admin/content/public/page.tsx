'use client'

import { useState } from 'react'
import { NotionContentView } from '@/components/admin/content/NotionContentView'

type Tab = '상품모델' | '시공사례' | '이벤트혜택'

export default function PublicContentPage() {
  const [tab, setTab] = useState<Tab>('상품모델')

  const tabs: { key: Tab; label: string }[] = [
    { key: '상품모델', label: '📋 상품모델' },
    { key: '시공사례', label: '📸 시공사례' },
    { key: '이벤트혜택', label: '🎁 이벤트혜택' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">마케팅 콘텐츠</h1>
        <p className="text-sm text-gray-500 mt-1">고객·웹 공개 콘텐츠 관리 (노션 실시간 연동)</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === '상품모델' && (
        <NotionContentView
          dbKey="상품모델"
          title="상품모델"
          emoji="📋"
          filterProp="유형"
          filterOptions={['정기딥케어', '정기엔드케어', '1회성케어', '세트상품']}
          columns={[
            { key: '__title', label: '상품명', width: 'w-48' },
            { key: '유형', label: '유형', type: 'badge', width: 'w-28' },
            { key: '가격', label: '가격', type: 'price', width: 'w-28' },
            { key: '기간', label: '기간', width: 'w-24' },
            { key: '판매상태', label: '상태', type: 'badge', width: 'w-24' },
            { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
            { key: '대표이미지URL', label: '이미지', type: 'url', width: 'w-24' },
          ]}
        />
      )}

      {tab === '시공사례' && (
        <NotionContentView
          dbKey="시공사례"
          title="시공사례"
          emoji="📸"
          filterProp="tags"
          filterOptions={['베스트사례', '주방', '욕실', '덕트', '후드', '바닥']}
          columns={[
            { key: '__title', label: '제목', width: 'w-48' },
            { key: '시공일', label: '시공일', type: 'date', width: 'w-28' },
            { key: '지역', label: '지역', width: 'w-24' },
            { key: '리뷰별점', label: '별점', type: 'badge', width: 'w-20' },
            { key: '리뷰', label: '리뷰' },
            { key: 'tags', label: '태그', type: 'tag-list', width: 'w-40' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
          ]}
        />
      )}

      {tab === '이벤트혜택' && (
        <NotionContentView
          dbKey="이벤트혜택"
          title="이벤트혜택"
          emoji="🎁"
          filterProp="혜택유형"
          filterOptions={['멤버십', '재계약', '신규가입']}
          columns={[
            { key: '__title', label: '이벤트명', width: 'w-48' },
            { key: '혜택유형', label: '혜택유형', type: 'badge', width: 'w-24' },
            { key: '유효기간', label: '유효기간', type: 'date', width: 'w-28' },
            { key: '설명', label: '설명' },
            { key: '태그', label: '태그', type: 'tag-list', width: 'w-40' },
          ]}
        />
      )}
    </div>
  )
}
