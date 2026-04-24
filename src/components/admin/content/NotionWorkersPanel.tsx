'use client'

import { NotionContentView } from './NotionContentView'

export function NotionWorkersPanel() {
  return (
    <NotionContentView
      dbKey="인사관리"
      title="인사관리 (노션)"
      emoji="👥"
      filterProp="상태"
      filterOptions={['재직', '휴직', '퇴사']}
      columns={[
        { key: '__title', label: '이름', width: 'w-32' },
        { key: '직책', label: '직책', type: 'badge', width: 'w-24' },
        { key: '상태', label: '상태', type: 'badge', width: 'w-20' },
        { key: '담당업무', label: '담당업무', type: 'tag-list', width: 'w-40' },
        { key: '입사일', label: '입사일', type: 'date', width: 'w-28' },
        { key: 'tags', label: '고용형태', type: 'tag-list', width: 'w-36' },
        { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
      ]}
    />
  )
}
