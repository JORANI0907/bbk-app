'use client'

/**
 * 규정 열람 화면 (전자법령 스타일): 왼쪽 목차(장·조) + 오른쪽 본문.
 * 관리자 미리보기와 (추후) 직원·고객 포털에서 그대로 재사용한다.
 */
import { useMemo } from 'react'
import { buildToc, renderRegulationHtml, formatKoreanDate } from '@/lib/regulations/articles'

interface RegulationViewerProps {
  code: string
  title: string
  htmlBody: string
  effectiveDate: string | null
  versionNo?: number | null
  /** 미발행 편집본 미리보기일 때 상단에 표시 */
  isDraft?: boolean
}

const BODY_CLASS =
  'regulation-body max-w-none text-sm leading-normal text-text-primary break-keep ' +
  '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-border ' +
  '[&_p]:my-1.5 [&_p>strong:only-child]:block [&_p>strong:only-child]:mt-5 [&_p>strong:only-child]:text-text-primary ' +
  '[&_table]:w-full [&_table]:my-3 [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top'

export default function RegulationViewer({ code, title, htmlBody, effectiveDate, versionNo, isDraft }: RegulationViewerProps) {
  const toc = useMemo(() => buildToc(htmlBody), [htmlBody])
  const rendered = useMemo(() => renderRegulationHtml(htmlBody, effectiveDate), [htmlBody, effectiveDate])

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-64 shrink-0">
        <nav className="lg:sticky lg:top-4 bg-surface border border-border-subtle rounded-2xl p-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs font-semibold text-text-tertiary mb-2">목차</p>
          {toc.length === 0 && <p className="text-xs text-text-tertiary">조문이 없습니다.</p>}
          {toc.map((chapter, i) => (
            <div key={`${chapter.title}-${i}`} className="mb-3">
              {chapter.title && <p className="text-xs font-bold text-text-secondary mb-1">{chapter.title}</p>}
              <ul className="space-y-0.5">
                {chapter.articles.map((a) => (
                  <li key={a.id}>
                    <a href={`#${a.id}`} className="block text-xs text-text-secondary hover:text-brand-600 py-0.5 break-keep">
                      {a.number}{a.title ? ` ${a.title}` : ''}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <article className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-2xl p-4 md:p-8">
        <header className="mb-6 pb-4 border-b border-border">
          <p className="text-xs text-text-tertiary">{code}{versionNo ? ` · 제${versionNo}판` : ''}{isDraft ? ' · 편집본(미발행)' : ''}</p>
          <h1 className="text-lg md:text-2xl font-bold leading-snug mt-1 break-keep">{title}</h1>
          <p className="text-xs text-text-secondary mt-2">
            시행일 {formatKoreanDate(effectiveDate) || '미정'} · 범빌드코리아 주식회사
          </p>
        </header>
        <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: rendered }} />
      </article>
    </div>
  )
}
