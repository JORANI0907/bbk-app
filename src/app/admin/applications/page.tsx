'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

type ServiceType = '1회성케어' | '정기딥케어' | '정기엔드케어'
type ApplicationStatus = '신규' | '검토중' | '계약완료' | '보류' | '거절'

interface User { id: string; name: string; role: string }
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
  request_notes: string | null
  status: ApplicationStatus
  admin_notes: string | null
  notion_page_id: string | null
  service_type: ServiceType | null
  assigned_to: string | null
  deposit: number | null
  supply_amount: number | null
  vat: number | null
  balance: number | null
  drive_folder_url: string | null
}

const SERVICE_TYPES: ServiceType[] = ['1회성케어', '정기딥케어', '정기엔드케어']

const STATUS_CONFIG: Record<ApplicationStatus, { color: string }> = {
  '신규':    { color: 'bg-blue-100 text-blue-700' },
  '검토중':  { color: 'bg-yellow-100 text-yellow-700' },
  '계약완료': { color: 'bg-green-100 text-green-700' },
  '보류':    { color: 'bg-gray-100 text-gray-600' },
  '거절':    { color: 'bg-red-100 text-red-600' },
}

const NOTIFICATION_TYPES = [
  '예약확정알림', '예약1일전알림', '예약당일알림', '작업완료알림',
  '결제알림', '결제완료알림', '계산서발행완료알림', '예약금환급완료알림',
  '예약취소알림', 'A/S방문알림', '방문견적알림',
]

function fmt(n: number | null | undefined) {
  if (!n) return '0'
  return n.toLocaleString('ko-KR')
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사됨`))
}

export default function ServiceManagementPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState<ServiceType>('1회성케어')
  const [selected, setSelected] = useState<Application | null>(null)
  const [saving, setSaving] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // 편집 필드
  const [adminNotes, setAdminNotes] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [deposit, setDeposit] = useState('')
  const [supplyAmount, setSupplyAmount] = useState('')
  const [vat, setVat] = useState('')
  const [balance, setBalance] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [appRes, userRes] = await Promise.all([
      fetch('/api/admin/applications'),
      fetch('/api/admin/users'),
    ])
    const appData = await appRes.json()
    const userData = await userRes.json()
    setApplications(appData.applications ?? [])
    setUsers((userData.users ?? []).filter((u: User) => u.role !== 'customer'))
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSelect = (app: Application) => {
    setSelected(app)
    setAdminNotes(app.admin_notes ?? '')
    setAssignedTo(app.assigned_to ?? '')
    setDeposit(String(app.deposit ?? ''))
    setSupplyAmount(String(app.supply_amount ?? ''))
    setVat(String(app.vat ?? ''))
    setBalance(String(app.balance ?? ''))
    setNotifyOpen(false)
  }

  const handleSave = async (extra?: Record<string, unknown>) => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          admin_notes: adminNotes,
          assigned_to: assignedTo || null,
          deposit: deposit ? Number(deposit) : 0,
          supply_amount: supplyAmount ? Number(supplyAmount) : 0,
          vat: vat ? Number(vat) : 0,
          balance: balance ? Number(balance) : 0,
          ...extra,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success('저장되었습니다.')
      await fetchAll()
      if (extra?.status) setSelected(prev => prev ? { ...prev, status: extra.status as ApplicationStatus } : prev)
      if (extra?.service_type) setSelected(prev => prev ? { ...prev, service_type: extra.service_type as ServiceType } : prev)
    } catch { toast.error('저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  const handleNotify = async (type: string) => {
    if (!selected) return
    setSending(true)
    setNotifyOpen(false)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: selected.id, type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${type} 발송 완료`)
    } catch (e) { toast.error(e instanceof Error ? e.message : '발송 실패') }
    finally { setSending(false) }
  }

  const handleDriveFolder = async () => {
    if (!selected) return
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const folderName = `${date} ${selected.business_name}`
    toast(`📁 폴더명: ${folderName}\n구글드라이브에서 직접 생성해주세요.`, { duration: 5000 })
  }

  const byType = (type: ServiceType) => applications.filter(a => (a.service_type ?? '1회성케어') === type)

  return (
    <div className="flex h-full gap-0 min-h-0">
      {/* 좌측: 목록 */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">서비스 관리</h1>
          <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
        </div>

        {/* 서비스 타입 탭 */}
        <div className="flex border-b border-gray-200 mb-4">
          {SERVICE_TYPES.map(type => (
            <button key={type}
              onClick={() => { setActiveType(type); setSelected(null) }}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors relative ${activeType === type ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {type}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeType === type ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {byType(type).length}
              </span>
            </button>
          ))}
        </div>

        {/* 목록 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : byType(activeType).length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">신청서가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">신청일</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">업체명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">대표자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">담당자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
                </tr>
              </thead>
              <tbody>
                {byType(activeType).map(app => (
                  <tr key={app.id}
                    onClick={() => handleSelect(app)}
                    className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === app.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(app.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{app.business_name}</td>
                    <td className="px-4 py-3 text-gray-700">{app.owner_name}</td>
                    <td className="px-4 py-3 text-gray-500">{users.find(u => u.id === app.assigned_to)?.name ?? '미배정'}</td>
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

      {/* 우측: 상세 패널 */}
      {selected && (
        <div className="w-[420px] ml-5 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
          {/* 헤더 */}
          <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-2 sticky top-0 bg-white z-10">
            <div>
              <h2 className="font-bold text-gray-900 text-base">{selected.business_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(selected.created_at).toLocaleString('ko-KR')}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 shrink-0">✕</button>
          </div>

          <div className="p-5 space-y-5">
            {/* 상태 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">상태</p>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                  <button key={s} disabled={saving}
                    onClick={() => handleSave({ status: s })}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selected.status === s ? STATUS_CONFIG[s].color + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            {/* 서비스 유형 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">서비스 유형</p>
              <div className="flex gap-1.5">
                {SERVICE_TYPES.map(t => (
                  <button key={t} disabled={saving}
                    onClick={() => handleSave({ service_type: t })}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${(selected.service_type ?? '1회성케어') === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* 담당자 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">담당자</p>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">미배정</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>)}
              </select>
            </div>

            {/* 고객 정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">고객 정보</p>
              <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-2">
                {/* 연락처 - 클릭시 전화 + 복사 */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">연락처</span>
                  <div className="flex gap-1.5">
                    <a href={`tel:${selected.phone}`}
                      className="text-xs text-blue-600 hover:underline font-medium">{selected.phone}</a>
                    <button onClick={() => copyText(selected.phone, '연락처')}
                      className="text-xs text-gray-400 hover:text-gray-600">📋</button>
                  </div>
                </div>
                {/* 주소 - 클릭시 지도 */}
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs text-gray-500 shrink-0">주소</span>
                  <button
                    onClick={() => {
                      const encoded = encodeURIComponent(selected.address)
                      window.open(`https://map.kakao.com/link/search/${encoded}`, '_blank')
                    }}
                    className="text-xs text-blue-600 hover:underline text-right">{selected.address}</button>
                </div>
                {/* 이메일 */}
                {selected.email && <Row label="이메일" value={selected.email} />}
                {/* 사업자번호 - 클릭시 복사 */}
                {selected.business_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">사업자번호</span>
                    <button onClick={() => copyText(selected.business_number!, '사업자번호')}
                      className="text-xs text-gray-800 hover:text-blue-600 font-mono">{selected.business_number} 📋</button>
                  </div>
                )}
                {/* 계좌번호 - 클릭시 복사 */}
                {selected.account_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">계좌번호</span>
                    <button onClick={() => copyText(selected.account_number!, '계좌번호')}
                      className="text-xs text-gray-800 hover:text-blue-600 font-mono">{selected.account_number} 📋</button>
                  </div>
                )}
                <Row label="결제방법" value={selected.payment_method} />
                <Row label="영업시간" value={selected.business_hours_start ? `${selected.business_hours_start} ~ ${selected.business_hours_end}` : null} />
                <Row label="엘리베이터" value={selected.elevator} />
                <Row label="주차" value={selected.parking} />
                <Row label="출입방법" value={selected.access_method} />
                {selected.request_notes && (
                  <div className="pt-1 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">요청사항</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{selected.request_notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 금액 정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">금액 정보</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '예약금', value: deposit, set: setDeposit },
                  { label: '공급가액', value: supplyAmount, set: setSupplyAmount },
                  { label: '부가세', value: vat, set: setVat },
                  { label: '잔금', value: balance, set: setBalance },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                    <input type="number" value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
              {/* 합계 표시 */}
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-600">
                <span>총액 (공급가액+부가세)</span>
                <span className="font-semibold text-gray-800">{fmt((Number(supplyAmount) || 0) + (Number(vat) || 0))}원</span>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              {/* 알림 발송 */}
              <div className="relative flex-1">
                <button onClick={() => setNotifyOpen(v => !v)} disabled={sending}
                  className="w-full py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-60 transition-colors">
                  {sending ? '발송 중...' : '📣 알림 발송'}
                </button>
                {notifyOpen && (
                  <div className="absolute bottom-full mb-1 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-72 overflow-y-auto">
                    {NOTIFICATION_TYPES.map(type => (
                      <button key={type} onClick={() => handleNotify(type)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 폴더 생성 */}
              <button onClick={handleDriveFolder}
                className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
                📁 폴더 생성
              </button>
            </div>

            {/* Notion 링크 */}
            {selected.notion_page_id && (
              <a href={`https://notion.so/${selected.notion_page_id.replace(/-/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <span>📝</span> Notion에서 보기
              </a>
            )}

            {/* 관리자 메모 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">관리자 메모</p>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                rows={3} placeholder="내부 메모를 입력하세요..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <button onClick={() => handleSave()} disabled={saving}
                className="mt-2 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 text-right">{value}</span>
    </div>
  )
}
