'use client'

import { NotionContentView } from './NotionContentView'

interface Props {
  /** 카테고리 필터 (급여정산 페이지에서 '인건비'로 고정) */
  categoryFilter?: string
  title?: string
}

export function NotionFinancePanel({ categoryFilter, title }: Props) {
  const filterOptions = categoryFilter
    ? []
    : ['서비스매출', '자재비', '인건비', '임대료', '광고비', '공과금', '기타']

  return (
    <NotionContentView
      dbKey="회계관리"
      title={title ?? '회계관리 (노션)'}
      emoji="💰"
      filterProp={categoryFilter ? undefined : '카테고리'}
      filterOptions={filterOptions}
      columns={[
        { key: '__title', label: '항목', width: 'w-48' },
        { key: '유형', label: '유형', type: 'badge', width: 'w-20' },
        { key: '카테고리', label: '카테고리', type: 'badge', width: 'w-28' },
        { key: '금액', label: '금액', type: 'price', width: 'w-32' },
        { key: '거래일', label: '거래일', type: 'date', width: 'w-28' },
        { key: '결제수단', label: '결제수단', type: 'badge', width: 'w-24' },
        { key: '메모', label: '메모' },
        { key: '증빙URL', label: '증빙', type: 'url', width: 'w-20' },
        { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
      ]}
    />
  )
}
