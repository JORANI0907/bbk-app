import { NotionContentView } from '@/components/admin/content/NotionContentView'

export default function ActivitiesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">관내활동</h1>
        <p className="text-sm text-gray-500 mt-1">회식·워크샵·교육 등 사내 활동 기록 (노션 실시간 연동)</p>
      </div>

      <NotionContentView
        dbKey="관내활동"
        title="관내활동"
        emoji="🎉"
        filterProp="유형"
        filterOptions={['회식', '워크샵', '교육', '조회', '기타']}
        columns={[
          { key: '__title', label: '제목', width: 'w-56' },
          { key: '날짜', label: '날짜', type: 'date', width: 'w-28' },
          { key: '유형', label: '유형', type: 'badge', width: 'w-24' },
          { key: '장소', label: '장소', width: 'w-28' },
          { key: '후기', label: '후기' },
          { key: 'tags', label: '태그', type: 'tag-list', width: 'w-36' },
          { key: 'visibility', label: '공개범위', type: 'badge', width: 'w-28' },
          { key: '사진URL', label: '사진', type: 'url', width: 'w-20' },
        ]}
      />
    </div>
  )
}
