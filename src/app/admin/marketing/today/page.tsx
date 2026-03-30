'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────

interface Content {
  id: string
  content_type: 'blog' | 'insta' | 'image_prompt'
  title: string
  body: string
  region: string
  item: string
  tags: string[] | null
  char_count: number | null
  is_published: boolean
  published_at: string | null
  created_at: string
}

// ─── Copy Button ──────────────────────────────────────────────

function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('클립보드에 복사됐어요!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-brand-100 hover:text-brand-700'
      }`}
    >
      {copied ? '✓ 복사됨' : `📋 ${label}`}
    </button>
  )
}

// ─── Publish Toggle ───────────────────────────────────────────

function PublishToggle({ content, onUpdate }: { content: Content; onUpdate: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const newVal = !content.is_published
    await supabase
      .from('marketing_content')
      .update({ is_published: newVal, published_at: newVal ? new Date().toISOString() : null })
      .eq('id', content.id)
    toast.success(newVal ? '발행 완료로 표시했어요!' : '발행 취소했어요')
    onUpdate()
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        content.is_published
          ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
          : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
      }`}
    >
      {content.is_published ? '✅ 발행완료' : '⬜ 미발행'}
    </button>
  )
}

// ─── Content Card ─────────────────────────────────────────────

function ContentCard({ content, onUpdate }: { content: Content; onUpdate: () => void }) {
  const typeConfig = {
    blog: { icon: '📝', label: '블로그', color: 'border-brand-200 bg-brand-50' },
    insta: { icon: '📸', label: '인스타그램', color: 'border-pink-200 bg-pink-50' },
    image_prompt: { icon: '🎨', label: '이미지 프롬프트', color: 'border-purple-200 bg-purple-50' },
  }
  const cfg = typeConfig[content.content_type]

  // 인스타의 경우 캡션과 해시태그 분리
  const isInsta = content.content_type === 'insta'
  const bodyLines = content.body.split('\n')
  const hashtagLine = isInsta ? bodyLines.find(l => l.trim().startsWith('#')) : null
  const captionText = isInsta && hashtagLine
    ? bodyLines.slice(0, bodyLines.indexOf(hashtagLine)).join('\n').trim()
    : content.body

  return (
    <div className={`rounded-2xl border-2 ${cfg.color} overflow-hidden`}>
      {/* 카드 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.icon}</span>
          <span className="font-semibold text-gray-800">{cfg.label}</span>
          <span className="text-xs text-gray-400">{content.region} · {content.item}</span>
        </div>
        <div className="flex items-center gap-2">
          {content.char_count && (
            <span className="text-xs text-gray-400">{content.char_count.toLocaleString()}자</span>
          )}
          <PublishToggle content={content} onUpdate={onUpdate} />
        </div>
      </div>

      {/* 제목 */}
      <div className="px-5 py-3 bg-white border-b border-gray-50">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900 text-sm flex-1 mr-3">{content.title}</p>
          <CopyButton text={content.title} label="제목 복사" />
        </div>
      </div>

      {/* 본문 */}
      <div className="px-5 py-4 bg-white">
        {isInsta ? (
          <div className="space-y-3">
            {/* 캡션 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">캡션</span>
                <CopyButton text={captionText} label="캡션 복사" />
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto">
                {captionText}
              </p>
            </div>
            {/* 해시태그 */}
            {hashtagLine && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">해시태그</span>
                  <CopyButton text={content.body.slice(content.body.indexOf('#'))} label="해시태그 복사" />
                </div>
                <p className="text-xs text-blue-600 leading-relaxed bg-blue-50 rounded-xl p-3 max-h-32 overflow-y-auto">
                  {content.body.slice(content.body.indexOf('#'))}
                </p>
              </div>
            )}
            {/* 전체 복사 */}
            <CopyButton text={content.body} label="전체 복사" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">본문</span>
              <CopyButton text={content.body} label="전체 복사" />
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-xs">
              {content.body}
            </div>
          </div>
        )}
      </div>

      {/* 태그 */}
      {content.tags && content.tags.length > 0 && (
        <div className="px-5 pb-4 bg-white">
          <div className="flex flex-wrap gap-1.5">
            {content.tags.slice(0, 8).map((tag, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function TodayContentPage() {
  const supabase = createClient()
  const [contents, setContents] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('marketing_content')
      .select('*')
      .gte('created_at', date + 'T00:00:00')
      .lte('created_at', date + 'T23:59:59')
      .order('content_type')
    setContents(data ?? [])
    setLoading(false)
  }

  const blog = contents.find(c => c.content_type === 'blog')
  const insta = contents.find(c => c.content_type === 'insta')
  const image = contents.find(c => c.content_type === 'image_prompt')

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">오늘 콘텐츠</h1>
          <p className="text-sm text-gray-500 mt-0.5">생성된 콘텐츠를 확인하고 복사해서 발행하세요</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-semibold text-gray-700">이 날짜에 생성된 콘텐츠가 없어요</p>
          <p className="text-sm text-gray-400 mt-1">다른 날짜를 선택하거나 대시보드에서 생성하세요</p>
        </div>
      ) : (
        <>
          {/* 발행 현황 요약 */}
          <div className="flex gap-3">
            {[
              { label: '블로그', data: blog, icon: '📝' },
              { label: '인스타', data: insta, icon: '📸' },
              { label: '이미지', data: image, icon: '🎨' },
            ].map(({ label, data, icon }) => (
              <div key={label} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                !data ? 'bg-gray-100 text-gray-400'
                : data.is_published ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
              }`}>
                <span>{icon}</span>
                <span>{label}</span>
                <span>{!data ? '미생성' : data.is_published ? '발행완료' : '미발행'}</span>
              </div>
            ))}
          </div>

          {/* 블로그 + 인스타 나란히 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {blog && <ContentCard content={blog} onUpdate={load} />}
            {insta && <ContentCard content={insta} onUpdate={load} />}
          </div>

          {/* 이미지 프롬프트 */}
          {image && (
            <ContentCard content={image} onUpdate={load} />
          )}
        </>
      )}
    </div>
  )
}
