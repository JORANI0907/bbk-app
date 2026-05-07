import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  fetchServiceItems,
  fetchServiceItemBySlug,
  fetchServiceBlocks,
  CATEGORY_CONFIG,
} from '@/lib/notion-services'

export const revalidate = 30

export async function generateStaticParams() {
  const items = await fetchServiceItems()
  return items.map((item) => ({ slug: item.slug }))
}

type Props = { params: { slug: string } }

export default async function ServiceDetailPage({ params }: Props) {
  const item = await fetchServiceItemBySlug(params.slug)
  if (!item) notFound()

  const blocks = await fetchServiceBlocks(item.id)
  const categoryConfig = item.category ? CATEGORY_CONFIG[item.category] : null

  return (
    <div className="px-4 py-5 flex flex-col gap-5 max-w-2xl mx-auto md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <Link
        href="/customer/services"
        className="flex items-center gap-1.5 text-sm text-brand-600 font-medium w-fit"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        서비스 범위 전체 보기
      </Link>

      {/* 헤더 */}
      <div>
        {categoryConfig && (
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
            {categoryConfig.icon} {categoryConfig.label}
          </p>
        )}
        <h1 className="text-2xl font-bold text-text-primary leading-tight">{item.name}</h1>
        {item.summary && (
          <p className="text-sm text-text-secondary mt-2 leading-normal">{item.summary}</p>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-surface-sunken text-text-secondary font-medium border border-border-subtle"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 본문 블록 */}
      {blocks.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-3">
          {blocks.map((block, idx) => {
            if (block.type === 'heading_1') {
              return (
                <h2 key={idx} className="text-base font-bold text-text-primary mt-2 first:mt-0">
                  {block.text}
                </h2>
              )
            }
            if (block.type === 'heading_2' || block.type === 'heading_3') {
              return (
                <h3 key={idx} className="text-sm font-bold text-text-primary mt-1 first:mt-0">
                  {block.text}
                </h3>
              )
            }
            if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
              return (
                <div key={idx} className="flex items-start gap-2 text-sm text-text-primary leading-normal">
                  <span className="text-text-tertiary mt-0.5 shrink-0">
                    {block.type === 'bulleted_list_item' ? '•' : `${idx + 1}.`}
                  </span>
                  <span>{block.text}</span>
                </div>
              )
            }
            return (
              <p key={idx} className="text-sm text-text-primary leading-normal">
                {block.text}
              </p>
            )
          })}
        </div>
      )}

      {blocks.length === 0 && !item.summary && (
        <div className="bg-surface rounded-2xl border border-border-subtle p-6 text-center">
          <p className="text-sm text-text-secondary">세부 내용을 준비 중입니다.</p>
        </div>
      )}

      {/* 문의 CTA */}
      <a
        href="tel:0317594877"
        className="flex items-center justify-between bg-brand-600 rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform"
      >
        <div>
          <p className="text-sm font-bold text-white">{item.name} 청소 문의하기</p>
          <p className="text-xs text-white/80 mt-0.5">031-759-4877</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white shrink-0"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </a>
    </div>
  )
}
