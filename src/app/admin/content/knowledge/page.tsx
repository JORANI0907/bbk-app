'use client'

import { useState } from 'react'
import { NotionContentView } from '@/components/admin/content/NotionContentView'

type Tab = '회사규정' | '서비스범위및안내'

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('회사규정')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">지식 베이스</h1>
        <p className="text-sm text-gray-500 mt-1">회사 내부 규정 및 서비스 안내 콘텐츠 (노션 실시간 연동)</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['회사규정', '서비스범위및안내'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === '회사규정' ? '📜 회사규정' : '🔧 서비스범위및안내'}
          </button>
        ))}
      </div>

      {tab === '회사규정' && (
        <NotionContentView
          dbKey="회사규정"
          title="회사규정"
          emoji="📜"
          filterProp="분류"
          filterOptions={['근로', '운영', '안전', '보안', '복리후생', '기타']}
          columns={[
            { key: '__title', label: '규정명', width: 'w-64' },
            { key: '분류', label: '분류', type: 'badge', width: 'w-24' },
            { key: '본문요약', label: '내용 요약' },
            { key: '버전', label: '버전', width: 'w-20' },
            { key: '최종개정일', label: '최종개정일', type: 'date', width: 'w-28' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
          ]}
        />
      )}

      {tab === '서비스범위및안내' && (
        <NotionContentView
          dbKey="서비스범위및안내"
          title="서비스범위및안내"
          emoji="🔧"
          filterProp="카테고리"
          filterOptions={['주방기기', '공간', '위생설비', '설비', '기타']}
          columns={[
            { key: '__title', label: '품목명', width: 'w-48' },
            { key: '카테고리', label: '카테고리', type: 'badge', width: 'w-28' },
            { key: '본문요약', label: '내용 요약' },
            { key: 'tags', label: '태그', type: 'tag-list', width: 'w-48' },
            { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
          ]}
        />
      )}
    </div>
  )
}
