'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface Worker { id: string; name: string }

type ApplicationStatus = '신규' | '검토중' | '계약완료' | '보류' | '거절'

interface Application {
  id: string
  created_at: string
  submitted_at: string | null
  owner_name: string
  platform_nickname: string | null
  phone: string
  email: string | null
  business_name: string
  business_number: string | null
  address: string
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  access_method: string | null
  parking: string | null
  payment_method: string | null
  account_number: string | null
  privacy_consent: string | null
  service_consent: string | null
  request_notes: string | null
  status: ApplicationStatus
  admin_notes: string | null
  notion_page_id: string | null
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string }> = {
  '신규':    { label: '신규',    color: 'bg-blue-100 text-blue-700' },
  '검토중':  { label: '검토중',  color: 'bg-yellow-100 text-yellow-700' },
  '계약완료': { label: '계약완료', color: 'bg-green-100 text-green-700' },
  '보류':    { label: '보류',    color: 'bg-gray-100 text-gray-600' },
  '거절':    { label: '거절',    color: 'bg-red-100 text-red-600' },
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('전체')
  const [selected, setSelected] = useState<Application | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [scheduleModal, setScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ worker_id: '', scheduled_date: '', scheduled_time_start: '09:00', scheduled_time_end: '12:00' })

  useEffect(() => {
    fetch('/api/admin/users?role=worker').then(r => r.json()).then(d => setWorkers(d.users ?? []))
  }, [])

  const handleCreateSchedule = async () => {
    if (!selected || !scheduleForm.scheduled_date) { toast.error('날짜를 선택해주세요.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: selected.id,
          business_name: selected.business_name,
          address: selected.address,
          contact_name: selected.owner_name,
          contact_phone: selected.phone,
          worker_id: scheduleForm.worker_id || null,
          scheduled_date: scheduleForm.scheduled_date,
          scheduled_time_start: scheduleForm.scheduled_time_start,
          scheduled_time_end: scheduleForm.scheduled_time_end,
        }),
      })
      if (!res.ok) throw new Error('생성 실패')
      toast.success('일정이 생성되었습니다.')
      setScheduleModal(false)
      setSelected(prev => prev ? { ...prev, status: '계약완료' } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, status: '계약완료' } : a))
    } catch {
      toast.error('일정 생성에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    try {
      const params = filterStatus !== '전체' ? `?status=${encodeURIComponent(filterStatus)}` : ''
      const res = await fetch(`/api/admin/applications${params}`)
      const data = await res.json()
      setApplications(data.applications ?? [])
    } catch {
      toast.error('데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { fetchApplications() }, [fetchApplications])

  const handleSelect = (app: Application) => {
    setSelected(app)
    setAdminNotes(app.admin_notes ?? '')
  }

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_notes: selected?.id === id ? adminNotes : undefined }),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success('상태가 변경되었습니다.')
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev)
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    } catch {
      toast.error('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, admin_notes: adminNotes }),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success('메모가 저장되었습니다.')
      setSelected(prev => prev ? { ...prev, admin_notes: adminNotes } : prev)
    } catch {
      toast.error('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const filtered = applications

  return (
    <div className="flex h-full gap-0">
      {/* 목록 패널 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">서비스 신청 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">공간케어 신청서 접수 및 계약 관리</p>
          </div>
          <button
            onClick={fetchApplications}
            className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            새로고침
          </button>
        </div>

        {/* 상태 필터 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['전체', '신규', '검토중', '계약완료', '보류', '거절'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">신청서가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">신청일</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">업체명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">대표자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">연락처</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">주소</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => handleSelect(app)}
                    className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors ${
                      selected?.id === app.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(app.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{app.business_name}</td>
                    <td className="px-4 py-3 text-gray-700">{app.owner_name}</td>
                    <td className="px-4 py-3 text-gray-600">{app.phone}</td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[180px]">{app.address}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[app.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {app.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      {selected && (
        <div className="w-96 ml-5 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto max-h-[calc(100vh-8rem)]">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{selected.business_name}</h2>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="p-5 space-y-5">
            {/* 상태 변경 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">상태 변경</p>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                  <button
                    key={s}
                    disabled={saving}
                    onClick={() => handleStatusChange(selected.id, s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selected.status === s
                        ? STATUS_CONFIG[s].color + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* 신청자 정보 */}
            <InfoSection title="신청자 정보">
              <InfoRow label="대표자" value={selected.owner_name} />
              <InfoRow label="플랫폼닉네임" value={selected.platform_nickname} />
              <InfoRow label="연락처" value={selected.phone} />
              <InfoRow label="이메일" value={selected.email} />
            </InfoSection>

            {/* 사업장 정보 */}
            <InfoSection title="사업장 정보">
              <InfoRow label="업체명" value={selected.business_name} />
              <InfoRow label="사업자번호" value={selected.business_number} />
              <InfoRow label="주소" value={selected.address} />
              <InfoRow label="영업시간" value={selected.business_hours_start ? `${selected.business_hours_start} ~ ${selected.business_hours_end}` : null} />
            </InfoSection>

            {/* 접근/주차 */}
            <InfoSection title="접근 · 주차">
              <InfoRow label="엘리베이터" value={selected.elevator} />
              <InfoRow label="건물출입" value={selected.building_access} />
              <InfoRow label="출입방법" value={selected.access_method} />
              <InfoRow label="주차" value={selected.parking} />
            </InfoSection>

            {/* 결제 */}
            <InfoSection title="결제 정보">
              <InfoRow label="결제방법" value={selected.payment_method} />
              <InfoRow label="계좌번호" value={selected.account_number} />
            </InfoSection>

            {/* 요청사항 */}
            {selected.request_notes && (
              <InfoSection title="요청사항">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.request_notes}</p>
              </InfoSection>
            )}

            {/* 일정 생성 버튼 */}
            <button
              onClick={() => { setScheduleForm({ worker_id: '', scheduled_date: '', scheduled_time_start: '09:00', scheduled_time_end: '12:00' }); setScheduleModal(true) }}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              📅 일정 생성
            </button>

            {/* Notion 링크 */}
            {selected.notion_page_id && (
              <a
                href={`https://notion.so/${selected.notion_page_id.replace(/-/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <span>📝</span> Notion에서 보기
              </a>
            )}

            {/* 관리자 메모 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">관리자 메모</p>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="내부 메모를 입력하세요..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="mt-2 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? '저장 중...' : '메모 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 생성 모달 */}
      {scheduleModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setScheduleModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">일정 생성</h2>
              <button onClick={() => setScheduleModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-sm text-gray-500">{selected.business_name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">날짜 *</label>
                <input type="date" value={scheduleForm.scheduled_date}
                  onChange={e => setScheduleForm(f => ({ ...f, scheduled_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">시작</label>
                  <input type="time" value={scheduleForm.scheduled_time_start}
                    onChange={e => setScheduleForm(f => ({ ...f, scheduled_time_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">종료</label>
                  <input type="time" value={scheduleForm.scheduled_time_end}
                    onChange={e => setScheduleForm(f => ({ ...f, scheduled_time_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">담당 직원</label>
                <select value={scheduleForm.worker_id}
                  onChange={e => setScheduleForm(f => ({ ...f, worker_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">미배정</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setScheduleModal(false)} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">취소</button>
              <button onClick={handleCreateSchedule} disabled={saving}
                className="flex-1 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? '생성 중...' : '일정 생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
      <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
      <span className="text-xs text-gray-800 text-right">{value}</span>
    </div>
  )
}
