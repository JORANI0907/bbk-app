'use client'

import { NotionContentView } from './NotionContentView'

export function NotionInventoryPanel() {
  return (
    <NotionContentView
      dbKey="재고관리"
      title="재고관리 (노션)"
      emoji="📦"
      filterProp="상태"
      filterOptions={['정상', '부족', '결품', '단종']}
      columns={[
        { key: '__title', label: '품목명', width: 'w-40' },
        { key: '카테고리', label: '카테고리', type: 'badge', width: 'w-24' },
        { key: '상태', label: '재고상태', type: 'badge', width: 'w-20' },
        { key: '현재재고', label: '현재재고', width: 'w-20' },
        { key: '재주문점', label: '재주문점', width: 'w-20' },
        { key: '단가', label: '단가', type: 'price', width: 'w-28' },
        { key: '단위', label: '단위', type: 'badge', width: 'w-16' },
        { key: '공급처', label: '공급처', width: 'w-28' },
        { key: '최근입고일', label: '최근입고일', type: 'date', width: 'w-28' },
        { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
      ]}
    />
  )
}
