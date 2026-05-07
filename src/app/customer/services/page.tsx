import Link from 'next/link'
import { fetchServiceItems, groupByCategory, CATEGORY_CONFIG } from '@/lib/notion-services'

export const revalidate = 30

export default async function CustomerServicesPage() {
  const items = await fetchServiceItems()
  const grouped = groupByCategory(items)

  return (
    <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto md:px-6 md:py-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary leading-tight">서비스 범위 안내</h1>
        <p className="text-sm text-text-secondary mt-1 leading-normal">
          범빌드코리아가 청소해드리는 서비스 항목을 확인하세요.
        </p>
      </div>

      {grouped.size === 0 && (
        <div className="bg-surface rounded-2xl border border-border-subtle p-8 text-center">
          <p className="text-sm text-text-secondary font-medium">서비스 정보를 불러오는 중입니다.</p>
          <p className="text-xs text-text-tertiary mt-1">잠시 후 다시 확인해주세요.</p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([category, categoryItems]) => {
        const config = CATEGORY_CONFIG[category] ?? { icon: '📋', label: category }
        return (
          <section key={category} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </h2>
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
              {categoryItems.map((item, idx) => (
                <Link
                  key={item.id}
                  href={`/customer/services/${item.slug}`}
                  className={`flex items-center gap-3 px-5 py-4 group hover:bg-surface-sunken active:bg-surface-sunken transition-colors ${
                    idx < categoryItems.length - 1 ? 'border-b border-border-subtle' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary group-hover:text-brand-600 transition-colors leading-snug">
                      {item.name}
                    </p>
                    {item.summary && (
                      <p className="text-xs text-text-tertiary mt-0.5 leading-normal line-clamp-1">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-text-tertiary shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )
      })}

      <div className="bg-brand-50 rounded-2xl p-4 flex items-start gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-brand-600 shrink-0 mt-0.5"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-brand-700">서비스 문의</p>
          <p className="text-xs text-brand-600 mt-0.5">
            원하시는 항목이 없거나 궁금한 사항은{' '}
            <a href="tel:0317594877" className="font-bold underline">
              031-759-4877
            </a>
            로 문의해주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
