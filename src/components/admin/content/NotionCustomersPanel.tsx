'use client'

import { NotionContentView } from './NotionContentView'

interface Props {
  /** 고객유형 필터 고정 (예: '1회성케어') */
  typeFilter?: string
}

export function NotionCustomersPanel({ typeFilter }: Props) {
  return (
    <NotionContentView
      dbKey="고객DB"
      title={typeFilter ? `${typeFilter} 고객 (노션)` : '고객DB (노션)'}
      emoji="🎯"
      filterProp={typeFilter ? undefined : '고객유형'}
      filterOptions={typeFilter ? [] : ['정기딥케어', '정기엔드케어', '1회성케어', '예비']}
      columns={[
        { key: '__title', label: '고객명', width: 'w-36' },
        { key: '고객유형', label: '유형', type: 'badge', width: 'w-28' },
        { key: '상태', label: '상태', type: 'badge', width: 'w-20' },
        { key: '연락처', label: '연락처', width: 'w-32' },
        { key: '주소', label: '주소' },
        { key: '담당자', label: '담당자', width: 'w-20' },
        { key: '최초계약일', label: '최초계약일', type: 'date', width: 'w-28' },
        { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
        { key: '메모', label: '메모', width: 'w-48' },
      ]}
    />
  )
}
