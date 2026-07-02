'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

interface AvailableVariable {
  id: string
  name: string
  label: string
  mode: 'auto' | 'manual'
}

// 계약서 저장용 BBK 기본 CSS
const BBK_WRAP_CSS = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');
body{max-width:800px;margin:0 auto;padding:40px 32px;font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;background:#fff;}
h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:8px;}
h2{font-size:15px;font-weight:700;margin-top:24px;margin-bottom:6px;}
h3{font-size:14px;font-weight:600;margin-top:16px;margin-bottom:4px;}
p{margin:6px 0;}
ul,ol{padding-left:24px;margin:6px 0;}
li{margin:4px 0;}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;}
th{background:#f0f0f0;border:1px solid #ccc;padding:8px 12px;text-align:left;font-weight:600;}
td{border:1px solid #ccc;padding:8px 12px;vertical-align:top;}
hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0;}
blockquote{border-left:3px solid #ddd;margin:12px 0;padding:4px 16px;color:#555;}
`.trim()

export function extractBodyContent(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return m?.[1]?.trim() ?? html
}

export function wrapWithBbkCss(bodyHtml: string): string {
  return `<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<style>\n${BBK_WRAP_CSS}\n</style>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>`
}

type Mode = 'visual' | 'html'

interface ContractEditorProps {
  value: string
  onChange: (html: string) => void
}

function TbBtn({
  onClick, active = false, title, children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors select-none ${
        active
          ? 'bg-brand-600 text-white'
          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

export default function ContractEditor({ value, onChange }: ContractEditorProps) {
  const [mode, setMode] = useState<Mode>('visual')
  const [isMounted, setIsMounted] = useState(false)
  const [availableVars, setAvailableVars] = useState<AvailableVariable[]>([])
  const valueRef = useRef(value)
  const prevModeRef = useRef<Mode>('visual')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/admin/contract-variables')
        const json = await res.json()
        if (!cancelled && json.success) {
          setAvailableVars(json.data ?? [])
        }
      } catch {
        // 실패해도 편집기는 동작 — 삽입 버튼만 비게 됨
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: extractBodyContent(value),
    onUpdate: ({ editor: e }) => {
      onChange(wrapWithBbkCss(e.getHTML()))
    },
    editorProps: {
      attributes: {
        class: 'contract-editor-content outline-none min-h-96 p-5',
      },
    },
    immediatelyRender: false,
  })

  const switchMode = useCallback((newMode: Mode) => {
    if (newMode === prevModeRef.current) return
    if (newMode === 'visual' && editor) {
      editor.commands.setContent(extractBodyContent(valueRef.current))
    }
    prevModeRef.current = newMode
    setMode(newMode)
  }, [editor])

  const insertVariable = useCallback((varName: string) => {
    const token = `{{${varName}}}`
    if (mode === 'visual' && editor) {
      editor.chain().focus().insertContent(token).run()
    } else if (mode === 'html' && textareaRef.current) {
      const el = textareaRef.current
      const s = el.selectionStart
      const e2 = el.selectionEnd
      const newVal = el.value.slice(0, s) + token + el.value.slice(e2)
      el.value = newVal
      el.selectionStart = el.selectionEnd = s + token.length
      el.focus()
      onChange(newVal)
    }
  }, [mode, editor, onChange])

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center py-16 text-text-tertiary text-sm">
        에디터 로딩 중…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 모드 전환 탭 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-surface-sunken rounded-xl p-1">
          <button
            type="button"
            onClick={() => switchMode('visual')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'visual'
                ? 'bg-surface shadow-soft text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            시각 편집
          </button>
          <button
            type="button"
            onClick={() => switchMode('html')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'html'
                ? 'bg-surface shadow-soft text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            HTML
          </button>
        </div>
        {mode === 'html' && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-state-warning-bg text-state-warning">
            HTML 직접 편집 — 코드 오류 주의
          </span>
        )}
      </div>

      {/* 변수 삽입 패널 */}
      <div className="bg-surface-sunken rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-text-secondary">
          변수 삽입 — 클릭하면 커서 위치에 자동으로 삽입됩니다
        </p>
        <div className="flex flex-wrap gap-1.5">
          {availableVars.length === 0 ? (
            <span className="text-xs text-text-tertiary">변수 목록을 불러오는 중...</span>
          ) : (
            availableVars.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => insertVariable(v.name)}
                title={`{{${v.name}}} 삽입`}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-75 active:scale-95 ${
                  v.mode === 'auto'
                    ? 'bg-state-success-bg text-state-success'
                    : 'bg-state-warning-bg text-state-warning'
                }`}
              >
                {v.label}
              </button>
            ))
          )}
        </div>
        <p className="text-[11px] text-text-tertiary leading-normal">
          <span className="inline-block w-2 h-2 rounded-full bg-state-success-bg border border-state-success mr-1 align-middle" />
          초록 — 고객 정보에서 자동 입력
          <span className="inline-block w-2 h-2 rounded-full bg-state-warning-bg border border-state-warning ml-3 mr-1 align-middle" />
          주황 — 계약서 작성 시 관리자가 직접 입력
        </p>
      </div>

      {/* 시각 편집 모드 */}
      {mode === 'visual' && (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* 포맷 툴바 */}
          <div className="flex flex-wrap gap-0.5 p-2 bg-surface-sunken border-b border-border items-center">
            <TbBtn
              onClick={() => editor?.chain().focus().toggleBold().run()}
              active={editor?.isActive('bold') ?? false}
              title="굵게 (Ctrl+B)"
            >
              <strong>굵게</strong>
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              active={editor?.isActive('italic') ?? false}
              title="기울임 (Ctrl+I)"
            >
              <em>기울임</em>
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              active={editor?.isActive('underline') ?? false}
              title="밑줄 (Ctrl+U)"
            >
              <u>밑줄</u>
            </TbBtn>

            <div className="w-px h-5 bg-border mx-1 self-center" />

            <TbBtn
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor?.isActive('heading', { level: 1 }) ?? false}
              title="큰 제목"
            >
              제목1
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor?.isActive('heading', { level: 2 }) ?? false}
              title="소제목"
            >
              제목2
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().setParagraph().run()}
              active={editor?.isActive('paragraph') ?? false}
              title="본문"
            >
              본문
            </TbBtn>

            <div className="w-px h-5 bg-border mx-1 self-center" />

            <TbBtn
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              active={editor?.isActive('bulletList') ?? false}
              title="목록"
            >
              • 목록
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive('orderedList') ?? false}
              title="번호 목록"
            >
              1. 목록
            </TbBtn>

            <div className="w-px h-5 bg-border mx-1 self-center" />

            <TbBtn
              onClick={() => editor?.chain().focus().setTextAlign('left').run()}
              active={editor?.isActive({ textAlign: 'left' }) ?? false}
              title="왼쪽 정렬"
            >
              ←정렬
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().setTextAlign('center').run()}
              active={editor?.isActive({ textAlign: 'center' }) ?? false}
              title="가운데 정렬"
            >
              중앙
            </TbBtn>
            <TbBtn
              onClick={() => editor?.chain().focus().setTextAlign('right').run()}
              active={editor?.isActive({ textAlign: 'right' }) ?? false}
              title="오른쪽 정렬"
            >
              →정렬
            </TbBtn>

            <div className="w-px h-5 bg-border mx-1 self-center" />

            <TbBtn
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              title="구분선 삽입"
            >
              ─ 구분선
            </TbBtn>
            <TbBtn
              onClick={() =>
                editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
              }
              title="표 삽입"
            >
              표 삽입
            </TbBtn>
          </div>

          {/* 에디터 본문 */}
          <div className="bg-white overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}

      {/* HTML 직접 편집 */}
      {mode === 'html' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={28}
          spellCheck={false}
          className="w-full border border-border rounded-xl px-3 py-2.5 text-xs font-mono bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-y leading-relaxed"
          placeholder="HTML 코드를 직접 입력합니다. 변수는 {{VAR_NAME}} 형식으로 사용하세요."
        />
      )}
    </div>
  )
}
