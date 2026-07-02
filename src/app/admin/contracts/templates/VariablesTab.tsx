'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { EmptyState } from '@/components/ui'
import { AUTO_FILL_FIELDS, PROCESS_AUTO_FIELDS } from '@/lib/contractTemplate'

interface VariableRecord {
  id: string
  name: string
  label: string
  description: string
  mode: 'auto' | 'manual'
  auto_field: string | null
  is_system: boolean
  sort_order: number
}

interface EditorState {
  id: string | null
  name: string
  label: string
  description: string
  mode: 'auto' | 'manual'
  autoField: string
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: '',
  label: '',
  description: '',
  mode: 'manual',
  autoField: '',
}

// 변수 이름 정규화 — 대문자·영숫자·언더스코어만 (실시간 미리보기용)
function normalizeName(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

export default function VariablesTab() {
  const [variables, setVariables] = useState<VariableRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)

  const fetchVariables = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/contract-variables')
      const json = await res.json()
      if (json.success) setVariables(json.data ?? [])
    } catch {
      toast.error('변수를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchVariables()
  }, [fetchVariables])

  const openCreate = () => setEditor(EMPTY_EDITOR)
  const openEdit = (v: VariableRecord) =>
    setEditor({
      id: v.id,
      name: v.name,
      label: v.label,
      description: v.description ?? '',
      mode: v.mode,
      autoField: v.auto_field ?? '',
    })
  const closeEditor = () => setEditor(null)

  const previewName = editor ? normalizeName(editor.name) : ''

  const handleSave = async () => {
    if (!editor) return
    const finalName = normalizeName(editor.name)
    if (!editor.id && !finalName) {
      toast.error('변수 이름을 입력해주세요.')
      return
    }
    if (!editor.label.trim()) {
      toast.error('한글 라벨을 입력해주세요.')
      return
    }
    if (editor.mode === 'auto' && !editor.autoField) {
      toast.error('자동 변수는 매핑 필드를 선택해야 합니다.')
      return
    }

    setIsSaving(true)
    try {
      const isEditing = !!editor.id
      const url = isEditing
        ? `/api/admin/contract-variables/${editor.id}`
        : '/api/admin/contract-variables'
      const method = isEditing ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        label: editor.label,
        description: editor.description,
        mode: editor.mode,
        auto_field: editor.mode === 'auto' ? editor.autoField : null,
      }
      if (!isEditing) body.name = finalName
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(isEditing ? '변수가 수정됐습니다.' : '변수가 추가됐습니다.')
        closeEditor()
        await fetchVariables()
      } else {
        toast.error(json.error ?? '저장에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (v: VariableRecord) => {
    if (v.is_system) {
      toast.error('시스템 기본 변수는 삭제할 수 없습니다.')
      return
    }
    if (!confirm(`"${v.label}" (${`{{${v.name}}}`}) 변수를 삭제합니다. 계속하시겠습니까?`)) return
    setDeletingId(v.id)
    try {
      const res = await fetch(`/api/admin/contract-variables/${v.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast.success('삭제됐습니다.')
        await fetchVariables()
      } else {
        toast.error(json.error ?? '삭제에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  // 매핑 필드 그룹 (자동 매핑 vs 계약 과정 처리)
  const dbFields = useMemo(
    () => Object.entries(AUTO_FILL_FIELDS).filter(([f]) => !PROCESS_AUTO_FIELDS.has(f)),
    [],
  )
  const processFields = useMemo(
    () => Object.entries(AUTO_FILL_FIELDS).filter(([f]) => PROCESS_AUTO_FIELDS.has(f)),
    [],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-text-secondary break-keep">
            계약서 양식에 삽입할 수 있는 변수 목록입니다. 시스템 기본 변수는 수정만 가능하며,
            <strong> 직접 만든 변수는 모든 양식에서 공유</strong>됩니다.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" />
          변수 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : variables.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-soft p-6">
          <EmptyState
            title="등록된 변수가 없습니다"
            description="'변수 추가' 버튼을 눌러 첫 변수를 만드세요."
          />
        </div>
      ) : (
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {variables.map((v) => (
              <div key={v.id} className="p-4 flex items-start justify-between gap-3 hover:bg-surface-sunken">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="bg-sky-50 text-brand-600 border border-sky-200 px-2 py-0.5 rounded text-xs font-mono">
                      {`{{${v.name}}}`}
                    </code>
                    <span className="text-sm font-semibold text-text-primary">{v.label}</span>
                    {v.is_system && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-sunken text-text-tertiary font-medium">
                        <Lock size={10} />
                        시스템
                      </span>
                    )}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        v.mode === 'auto'
                          ? 'bg-state-success-bg text-state-success'
                          : 'bg-state-warning-bg text-state-warning'
                      }`}
                    >
                      {v.mode === 'auto' ? '자동' : '수동'}
                    </span>
                  </div>
                  {v.description && (
                    <p className="text-xs text-text-secondary">{v.description}</p>
                  )}
                  {v.mode === 'auto' && v.auto_field && (
                    <p className="text-xs text-text-tertiary">
                      매핑: {AUTO_FILL_FIELDS[v.auto_field] ?? v.auto_field}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                    <Pencil size={13} className="mr-1" />
                    수정
                  </Button>
                  {!v.is_system && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(v)}
                      isLoading={deletingId === v.id}
                      className="text-state-danger hover:bg-state-danger-bg"
                    >
                      <Trash2 size={13} className="mr-1" />
                      삭제
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 추가·수정 모달 */}
      <Modal
        open={!!editor}
        onClose={closeEditor}
        title={editor?.id ? '변수 수정' : '새 변수 추가'}
      >
        {editor && (
          <div className="space-y-4 pt-2">
            {/* 변수 이름 (신규만 편집 가능) */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                변수 이름 <span className="text-state-danger">*</span>
                <span className="text-xs text-text-tertiary font-normal ml-1">— 대문자·영숫자·언더스코어만</span>
              </label>
              <input
                type="text"
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                disabled={!!editor.id}
                placeholder="예: PAYMENT_AMOUNT"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-surface-sunken disabled:text-text-tertiary"
              />
              <p className="text-xs text-text-tertiary mt-1">
                실제 저장 이름:{' '}
                <code className="bg-sky-50 text-brand-600 border border-sky-200 px-1.5 py-0.5 rounded font-mono">
                  {previewName ? `{{${previewName}}}` : '(입력 대기)'}
                </code>
              </p>
              {editor.id && (
                <p className="text-xs text-text-tertiary mt-1">
                  이미 사용 중인 양식들이 있을 수 있어 이름은 변경할 수 없습니다.
                </p>
              )}
            </div>

            {/* 한글 라벨 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                한글 라벨 <span className="text-state-danger">*</span>
              </label>
              <input
                type="text"
                value={editor.label}
                onChange={(e) => setEditor({ ...editor, label: e.target.value })}
                placeholder="예: 결제 금액"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">설명</label>
              <input
                type="text"
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                placeholder="이 변수가 언제 쓰이는지 간단히 설명"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            {/* 모드 선택 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">채움 방식</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="editor-mode"
                    checked={editor.mode === 'auto'}
                    onChange={() => setEditor({ ...editor, mode: 'auto' })}
                    className="accent-brand-600"
                  />
                  <span className="text-sm text-text-primary">자동 (고객·계약 DB에서)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="editor-mode"
                    checked={editor.mode === 'manual'}
                    onChange={() => setEditor({ ...editor, mode: 'manual', autoField: '' })}
                    className="accent-brand-600"
                  />
                  <span className="text-sm text-text-primary">수동 입력</span>
                </label>
              </div>
            </div>

            {/* 자동 선택 시 매핑 필드 드롭다운 */}
            {editor.mode === 'auto' && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  매핑 필드 <span className="text-state-danger">*</span>
                </label>
                <select
                  value={editor.autoField}
                  onChange={(e) => setEditor({ ...editor, autoField: e.target.value })}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">-- 매핑할 필드 선택 --</option>
                  <optgroup label="고객·계약 DB 자동 매핑">
                    {dbFields.map(([field, label]) => (
                      <option key={field} value={field}>{label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="계약 과정 자동 처리">
                    {processFields.map(([field, label]) => (
                      <option key={field} value={field}>{label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={closeEditor}>
                취소
              </Button>
              <Button className="flex-1" onClick={handleSave} isLoading={isSaving}>
                {editor.id ? '수정' : '추가'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
