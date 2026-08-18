'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { DocumentRequestModal } from './DocumentRequestModal'
import { getDocumentLabel, type WorkerDocumentType } from '@/lib/workerDocuments'

interface Props {
  workerId: string
  workerName: string | null
  workerPhone: string | null
}

interface RequestItem {
  id: string
  document_type: WorkerDocumentType
  document_label: string
  file_path: string | null
  file_name: string | null
  file_mime: string | null
  file_size: number | null
  uploaded_at: string | null
  created_at: string
}

interface DocumentRequest {
  id: string
  token: string
  token_expires_at: string
  status: 'pending' | 'submitted' | 'expired'
  submitted_at: string | null
  otp_phone: string
  message_body: string
  created_at: string
  updated_at: string
  worker_document_request_items: RequestItem[]
}

const STATUS_LABELS: Record<DocumentRequest['status'], string> = {
  pending: '대기 중',
  submitted: '제출 완료',
  expired: '만료됨',
}

const STATUS_COLORS: Record<DocumentRequest['status'], string> = {
  pending: 'bg-state-warning-bg text-state-warning',
  submitted: 'bg-state-success-bg text-state-success',
  expired: 'bg-surface-sunken text-text-tertiary',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function WorkerDocumentSection({ workerId, workerName, workerPhone }: Props) {
  const [requests, setRequests] = useState<DocumentRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const APP_URL =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://app.bbkorea.co.kr'

  const fetchRequests = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/document-requests`)
      const json = await res.json()
      if (json.success) setRequests(json.data ?? [])
    } catch {
      toast.error('서류 요청 이력을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [workerId])

  useEffect(() => { void fetchRequests() }, [fetchRequests])

  const copyLink = (token: string) => {
    const url = `${APP_URL}/worker-documents/${token}`
    void navigator.clipboard.writeText(url)
    toast.success('링크가 복사되었습니다.')
  }

  const openFile = (itemId: string) => {
    // view 모드: signed URL redirect → 새 탭에서 뷰어
    window.open(`/api/admin/document-requests/items/${itemId}/download?mode=view`, '_blank', 'noopener,noreferrer')
  }

  const downloadFile = (itemId: string) => {
    // attachment 모드: 다운로드 강제
    window.location.href = `/api/admin/document-requests/items/${itemId}/download?mode=attachment`
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📩 서류 요청·수집</p>
        <Button size="sm" onClick={() => setShowModal(true)}>
          서류 요청
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 text-center">
          <span className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin inline-block" />
        </div>
      ) : requests.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-text-tertiary bg-surface-sunken rounded-lg">
          아직 서류 요청 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const uploadedCount = req.worker_document_request_items.filter(it => it.uploaded_at).length
            const totalCount = req.worker_document_request_items.length
            const expired = new Date(req.token_expires_at) < new Date() && req.status !== 'submitted'
            const displayStatus = expired ? 'expired' : req.status

            return (
              <div key={req.id} className="border border-border-subtle rounded-xl p-3 bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[displayStatus]}`}>
                      {STATUS_LABELS[displayStatus]}
                    </span>
                    <span className="text-[11px] text-text-tertiary">
                      {formatDateTime(req.created_at)}
                    </span>
                  </div>
                  <span className="text-[11px] text-text-secondary">
                    {uploadedCount}/{totalCount} 제출
                  </span>
                </div>

                {/* 서류 항목별 파일 */}
                <div className="space-y-1.5">
                  {req.worker_document_request_items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 text-xs bg-surface-sunken rounded-md px-2.5 py-1.5"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-text-primary">
                          {getDocumentLabel(item.document_type, item.document_label)}
                        </span>
                        {item.uploaded_at ? (
                          <span className="block text-[10px] text-text-tertiary truncate">
                            {item.file_name} · {formatFileSize(item.file_size)}
                          </span>
                        ) : (
                          <span className="block text-[10px] text-text-tertiary">
                            미제출
                          </span>
                        )}
                      </span>
                      {item.uploaded_at && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openFile(item.id)}
                            className="text-[10px] px-2 py-1 rounded-md text-brand-600 hover:bg-brand-50 transition-colors"
                            title="새 창에서 열기"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => downloadFile(item.id)}
                            className="text-[10px] px-2 py-1 rounded-md text-text-secondary hover:bg-surface transition-colors"
                            title="다운로드"
                          >
                            ⬇ 다운로드
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 링크 복사 (아직 미제출·만료 안 된 요청만) */}
                {!expired && req.status === 'pending' && (
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="text-text-tertiary">
                      링크 유효기간: {formatDateTime(req.token_expires_at)}
                    </span>
                    <button
                      onClick={() => copyLink(req.token)}
                      className="text-brand-600 hover:underline"
                    >
                      링크 복사
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <DocumentRequestModal
        open={showModal}
        onClose={() => setShowModal(false)}
        workerId={workerId}
        workerName={workerName ?? '직원'}
        defaultOtpPhone={workerPhone ?? ''}
        onCreated={fetchRequests}
      />
    </div>
  )
}
