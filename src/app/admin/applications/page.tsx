'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import type { DriveFolder } from '@/lib/googleDrive'

const getDriveLib = () => import('@/lib/googleDrive')

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
  construction_date: string | null
}

interface NotifyLog { type: string; sentAt: string }

type SortField = 'construction_date' | 'created_at' | 'business_name' | 'owner_name' | 'payment_method' | 'status'
type SortDir = 'asc' | 'desc'

// ─── 상수 ────────────────────────────────────────────────────
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
// 신청서 폼과 동일한 옵션
const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '현금(부가세 X)']
const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']
const SORT_LABELS: Record<SortField, string> = {
  construction_date: '시공일자',
  created_at: '신청일',
  business_name: '업체명',
  owner_name: '대표자',
  payment_method: '결제방법',
  status: '상태',
}

// ─── 알림 이력 (localStorage) ────────────────────────────────
const LOG_KEY = 'bbk_notify_logs'
function loadLogs(appId: string): NotifyLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}')[appId] || [] }
  catch { return [] }
}
function appendLog(appId: string, log: NotifyLog) {
  try {
    const all = JSON.parse(localStorage.getItem(LOG_KEY) || '{}')
    all[appId] = [log, ...(all[appId] || [])].slice(0, 50)
    localStorage.setItem(LOG_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

// ─── 헬퍼 ────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString('ko-KR'))
const copyText = (text: string, label: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사됨`))
const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'

function isMigrationError(msg: string) {
  return msg.includes('does not exist') || msg.includes('column') || msg.includes('no such column')
}

function sortApplications(apps: Application[], field: SortField, dir: SortDir): Application[] {
  return [...apps].sort((a, b) => {
    let va: string | null = null
    let vb: string | null = null
    if (field === 'construction_date') { va = a.construction_date; vb = b.construction_date }
    else if (field === 'created_at') { va = a.created_at; vb = b.created_at }
    else if (field === 'business_name') { va = a.business_name; vb = b.business_name }
    else if (field === 'owner_name') { va = a.owner_name; vb = b.owner_name }
    else if (field === 'payment_method') { va = a.payment_method; vb = b.payment_method }
    else if (field === 'status') { va = a.status; vb = b.status }
    // null값 항상 마지막
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'desc' ? -cmp : cmp
  })
}

// ─── 소형 UI 컴포넌트 ────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}
function EditRow({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        className={`flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        <option value="">선택</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
function AmountInput({ label, value, onChange, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {label}{hint && <span className="ml-1 text-blue-500">{hint}</span>}
      </label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        placeholder="0" disabled={disabled}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400" />
    </div>
  )
}

// ─── Google Drive 폴더 생성 모달 ─────────────────────────────
function DriveFolderModal({
  businessName, initialDate, onClose,
  onSelectFolder, onConfirm,
  savedFolder, creating,
}: {
  businessName: string
  initialDate: string
  onClose: () => void
  onSelectFolder: () => void
  onConfirm: (date: string) => void
  savedFolder: DriveFolder | null
  creating: boolean
}) {
  const [constructionDate, setConstructionDate] = useState(initialDate || today())
  const dateStr = constructionDate.replace(/-/g, '')
  const folderName = `${dateStr} ${businessName}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-900">📁 Google Drive 폴더 생성</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">생성될 폴더 구조</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📁</span>
                <span className="text-sm font-semibold text-gray-800">{folderName}</span>
              </div>
              <div className="ml-7 space-y-1">
                <div className="flex items-center gap-2 text-sm text-gray-600"><span>📁</span><span>작업 전</span></div>
                <div className="flex items-center gap-2 text-sm text-gray-600"><span>📁</span><span>작업 후</span></div>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">시공일자</label>
            <input type="date" value={constructionDate}
              onChange={e => setConstructionDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">저장 위치 (Google Drive)</p>
            {savedFolder ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">📂</span>
                  <span className="text-sm font-medium text-blue-700 truncate">{savedFolder.name}</span>
                </div>
                <button onClick={onSelectFolder} className="text-xs text-blue-500 hover:text-blue-700 underline ml-2 shrink-0">변경</button>
              </div>
            ) : (
              <button onClick={onSelectFolder}
                className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                <span className="text-lg">🗂️</span><span>Google Drive에서 위치 선택</span>
              </button>
            )}
            {!savedFolder && <p className="text-xs text-gray-400 mt-1.5">선택한 위치는 다음에도 기억됩니다.</p>}
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors">취소</button>
          <button onClick={() => onConfirm(constructionDate)} disabled={!savedFolder || creating}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            {creating ? '⏳ 생성 중...' : '📁 폴더 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function ServiceManagementPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState<ServiceType>('1회성케어')
  const [selected, setSelected] = useState<Application | null>(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // 정렬
  const [sortField, setSortField] = useState<SortField>('construction_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // 알림
  const [notifyType, setNotifyType] = useState('')
  const [notifyLogs, setNotifyLogs] = useState<NotifyLog[]>([])

  // Google Drive
  const [driveModalOpen, setDriveModalOpen] = useState(false)
  const [savedDriveFolder, setSavedDriveFolder] = useState<DriveFolder | null>(null)
  const [driveToken, setDriveToken] = useState<string | null>(null)
  const [driveCreating, setDriveCreating] = useState(false)

  // 편집 필드
  const [adminNotes, setAdminNotes] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [constructionDate, setConstructionDate] = useState('')
  const [deposit, setDeposit] = useState('')
  const [supplyAmount, setSupplyAmount] = useState('')
  const [vat, setVat] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [elevator, setElevator] = useState('')
  const [buildingAccess, setBuildingAccess] = useState('')
  const [parking, setParking] = useState('')
  const [accessMethod, setAccessMethod] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [businessHoursStart, setBusinessHoursStart] = useState('')
  const [businessHoursEnd, setBusinessHoursEnd] = useState('')

  const vatManual = useRef(false)

  const isCashNoVat = paymentMethod === '현금(부가세 X)'
  const effectiveVat = isCashNoVat ? 0 : (Number(vat) || 0)
  const totalAmount = (Number(supplyAmount) || 0) + effectiveVat
  const computedBalance = totalAmount - (Number(deposit) || 0)

  useEffect(() => {
    getDriveLib().then(lib => setSavedDriveFolder(lib.getSavedDriveFolder()))
  }, [])

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
    // 신청서 제출 값 우선 반영 (null이면 빈 문자열)
    setAdminNotes(app.admin_notes ?? '')
    setAssignedTo(app.assigned_to ?? '')
    setConstructionDate(app.construction_date ?? '')
    setDeposit(String(app.deposit ?? ''))
    setSupplyAmount(String(app.supply_amount ?? ''))
    setVat(String(app.vat ?? ''))
    setPaymentMethod(app.payment_method ?? '')
    setPhone(app.phone ?? '')
    setEmail(app.email ?? '')
    setAddress(app.address ?? '')
    setBusinessNumber(app.business_number ?? '')
    setAccountNumber(app.account_number ?? '')
    setElevator(app.elevator ?? '')
    setBuildingAccess(app.building_access ?? '')
    setParking(app.parking ?? '')
    setAccessMethod(app.access_method ?? '')
    setRequestNotes(app.request_notes ?? '')
    setBusinessHoursStart(app.business_hours_start ?? '')
    setBusinessHoursEnd(app.business_hours_end ?? '')
    setNotifyType('')
    setNotifyLogs(loadLogs(app.id))
    vatManual.current = false
  }

  const quickSave = async (fields: Partial<Application>) => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      toast.success('변경되었습니다.')
      setSelected(prev => prev ? { ...prev, ...fields } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, ...fields } : a))
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      if (isMigrationError(msg)) {
        toast.error('⚠️ Supabase SQL 마이그레이션을 먼저 실행해주세요.', { duration: 6000 })
      } else { toast.error(msg) }
    } finally { setSaving(false) }
  }

  const handleSave = async () => {
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
          construction_date: constructionDate || null,
          deposit: Number(deposit) || 0,
          supply_amount: Number(supplyAmount) || 0,
          vat: effectiveVat,
          balance: computedBalance,
          payment_method: paymentMethod || null,
          phone: phone || null,
          email: email || null,
          address: address || null,
          business_number: businessNumber || null,
          account_number: accountNumber || null,
          elevator: elevator || null,
          building_access: buildingAccess || null,
          access_method: accessMethod || null,
          parking: parking || null,
          request_notes: requestNotes || null,
          business_hours_start: businessHoursStart || null,
          business_hours_end: businessHoursEnd || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      toast.success('저장되었습니다.')
      await fetchAll()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      if (isMigrationError(msg)) {
        toast.error('⚠️ Supabase SQL 마이그레이션을 먼저 실행해주세요.', { duration: 6000 })
      } else { toast.error(msg) }
    } finally { setSaving(false) }
  }

  const handleSupplyChange = (val: string) => {
    setSupplyAmount(val)
    if (!isCashNoVat && !vatManual.current) {
      setVat(String(Math.round((Number(val) || 0) * 0.1)))
    }
  }
  const handleVatChange = (val: string) => { vatManual.current = true; setVat(val) }
  const handlePaymentMethodChange = (val: string) => {
    setPaymentMethod(val)
    if (val === '현금(부가세 X)') { setVat('0'); vatManual.current = true }
    else { vatManual.current = false; if (supplyAmount) setVat(String(Math.round((Number(supplyAmount) || 0) * 0.1))) }
  }

  const handleNotify = async () => {
    if (!selected || !notifyType) { toast.error('알림 유형을 선택해주세요.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: selected.id, type: notifyType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const log: NotifyLog = { type: notifyType, sentAt: new Date().toISOString() }
      appendLog(selected.id, log)
      setNotifyLogs(prev => [log, ...prev])
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
    } catch (e) { toast.error(e instanceof Error ? e.message : '발송 실패') }
    finally { setSending(false) }
  }

  const handleSelectDriveFolder = async () => {
    try {
      const lib = await getDriveLib()
      await lib.loadGoogleAPIs()
      const token = driveToken || await lib.requestGoogleToken()
      setDriveToken(token)
      const folder = await lib.openFolderPicker(token)
      if (folder) { setSavedDriveFolder(folder); lib.saveDriveFolderCookie(folder) }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Google Drive 연결 실패') }
  }

  const handleConfirmDriveCreate = async (date: string) => {
    if (!selected || !savedDriveFolder) return
    setDriveCreating(true)
    try {
      const lib = await getDriveLib()
      let token = driveToken
      if (!token) {
        await lib.loadGoogleAPIs()
        token = await lib.requestGoogleToken()
        setDriveToken(token)
      }
      const { folderUrl, folderName } = await lib.createWorkFolderStructure(
        savedDriveFolder.id, selected.business_name, date, token
      )
      await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, drive_folder_url: folderUrl, construction_date: date }),
      })
      // construction_date도 로컬 상태 업데이트
      setConstructionDate(date)
      setSelected(prev => prev ? { ...prev, drive_folder_url: folderUrl, construction_date: date } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, drive_folder_url: folderUrl, construction_date: date } : a))
      setDriveModalOpen(false)
      toast.success(`✅ "${folderName}" 폴더 생성 완료!`, { duration: 5000 })
      window.open(folderUrl, '_blank')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '폴더 생성 실패'
      // File not found: 저장된 폴더가 Drive에서 삭제된 경우
      if (msg.includes('File not found') || msg.includes('not found')) {
        toast.error('저장된 Drive 폴더를 찾을 수 없습니다. 위치를 다시 선택해주세요.', { duration: 5000 })
        setSavedDriveFolder(null)
        // 쿠키 초기화
        getDriveLib().then(lib => {
          document.cookie = 'bbk_drive_folder=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
        })
      } else {
        toast.error(msg)
      }
    } finally { setDriveCreating(false) }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'construction_date' ? 'desc' : 'asc')
    }
  }

  const byType = (type: ServiceType) => {
    const filtered = applications.filter(a => (a.service_type ?? '1회성케어') === type)
    return sortApplications(filtered, sortField, sortDir)
  }

  return (
    <>
      {driveModalOpen && selected && (
        <DriveFolderModal
          businessName={selected.business_name}
          initialDate={constructionDate || today()}
          onClose={() => setDriveModalOpen(false)}
          onSelectFolder={handleSelectDriveFolder}
          onConfirm={handleConfirmDriveCreate}
          savedFolder={savedDriveFolder}
          creating={driveCreating}
        />
      )}

      <div className="flex h-full gap-0 min-h-0">
        {/* ── 좌측: 목록 ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">서비스 관리</h1>
            <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
          </div>

          {/* 서비스 유형 탭 */}
          <div className="flex border-b border-gray-200 mb-3">
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

          {/* 정렬 컨트롤 */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-xs text-gray-400">정렬:</span>
            <div className="flex gap-1 flex-wrap">
              {(Object.entries(SORT_LABELS) as [SortField, string][]).map(([field, label]) => (
                <button key={field} onClick={() => toggleSort(field)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    sortField === field ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {label}
                  {sortField === field && <span>{sortDir === 'desc' ? '↓' : '↑'}</span>}
                </button>
              ))}
            </div>
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
                    {[
                      { label: '시공일자', field: 'construction_date' as SortField },
                      { label: '업체명', field: 'business_name' as SortField },
                      { label: '대표자', field: 'owner_name' as SortField },
                      { label: '담당자', field: null },
                      { label: '결제방법', field: 'payment_method' as SortField },
                      { label: '상태', field: 'status' as SortField },
                    ].map(({ label, field }) => (
                      <th key={label}
                        onClick={field ? () => toggleSort(field) : undefined}
                        className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap ${field ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                        {label}
                        {field && sortField === field && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byType(activeType).map(app => (
                    <tr key={app.id} onClick={() => handleSelect(app)}
                      className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === app.id ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                        {app.construction_date ? fmtDate(app.construction_date) : <span className="text-gray-300">미설정</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{app.business_name}</td>
                      <td className="px-4 py-3 text-gray-700">{app.owner_name}</td>
                      <td className="px-4 py-3 text-gray-500">{users.find(u => u.id === app.assigned_to)?.name ?? '미배정'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{app.payment_method ?? '-'}</td>
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

        {/* ── 우측: 상세 패널 ── */}
        {selected && (
          <div className="w-[460px] ml-5 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 6rem)' }}>
            {/* 헤더 */}
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-2 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-bold text-gray-900">{selected.business_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">신청일: {new Date(selected.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="p-4 space-y-5">
              {/* 상태 */}
              <Section title="상태">
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                    <button key={s} disabled={saving}
                      onClick={() => quickSave({ status: s })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected.status === s
                          ? STATUS_CONFIG[s].color + ' ring-2 ring-offset-1 ring-current'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{s}</button>
                  ))}
                </div>
              </Section>

              {/* 서비스 유형 */}
              <Section title="서비스 유형">
                <div className="flex gap-1.5 flex-wrap">
                  {SERVICE_TYPES.map(t => (
                    <button key={t} disabled={saving}
                      onClick={() => quickSave({ service_type: t })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        (selected.service_type ?? '1회성케어') === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{t}</button>
                  ))}
                </div>
              </Section>

              {/* 시공일자 */}
              <Section title="시공일자">
                <input type="date" value={constructionDate} onChange={e => setConstructionDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Section>

              {/* 담당자 */}
              <Section title="담당자">
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">미배정</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>
                  ))}
                </select>
              </Section>

              {/* 고객 정보 */}
              <Section title="고객 정보">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">연락처</span>
                    <div className="flex flex-1 gap-1">
                      <input value={phone} onChange={e => setPhone(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <a href={`tel:${phone}`} className="px-2 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">📞</a>
                      <button onClick={() => copyText(phone, '연락처')} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                    </div>
                  </div>
                  <EditRow label="이메일" value={email} onChange={setEmail} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">주소</span>
                    <div className="flex flex-1 gap-1">
                      <input value={address} onChange={e => setAddress(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(address)}`, '_blank')}
                        className="px-2 py-1.5 text-xs bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 shrink-0">🗺️</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">사업자번호</span>
                    <div className="flex flex-1 gap-1">
                      <input value={businessNumber} onChange={e => setBusinessNumber(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      <button onClick={() => copyText(businessNumber, '사업자번호')} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">계좌번호</span>
                    <div className="flex flex-1 gap-1">
                      <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      <button onClick={() => copyText(accountNumber, '계좌번호')} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                    </div>
                  </div>

                  {/* 결제방법 (신청서 폼과 동일 옵션) */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1">결제방법</span>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m} type="button" onClick={() => handlePaymentMethodChange(m)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${paymentMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 영업시간 (수정 가능) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">영업시간</span>
                    <div className="flex items-center gap-1 flex-1">
                      <input type="time" value={businessHoursStart} onChange={e => setBusinessHoursStart(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="text-gray-400 text-xs">~</span>
                      <input type="time" value={businessHoursEnd} onChange={e => setBusinessHoursEnd(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  {/* 엘리베이터 (신청서 폼과 동일 옵션) */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1">엘리베이터</span>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {ELEVATOR_OPTIONS.map(o => (
                        <button key={o} type="button" onClick={() => setElevator(o)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${elevator === o ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 건물출입 (신청서 폼과 동일 옵션) */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1">건물출입</span>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {BUILDING_ACCESS_OPTIONS.map(o => (
                        <button key={o} type="button" onClick={() => setBuildingAccess(o)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${buildingAccess === o ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 주차 (신청서 폼과 동일 옵션) */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1">주차</span>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {PARKING_OPTIONS.map(o => (
                        <button key={o} type="button" onClick={() => setParking(o)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${parking === o ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  <EditRow label="출입방법" value={accessMethod} onChange={setAccessMethod} />

                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">요청사항</span>
                    <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={2}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                </div>
              </Section>

              {/* 금액 정보 */}
              <Section title="금액 정보">
                {isCashNoVat && (
                  <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700 font-semibold">💵 현금 결제 — 부가세 미적용</p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <AmountInput label="예약금" value={deposit} onChange={setDeposit} />
                    <AmountInput label="공급가액" value={supplyAmount} onChange={handleSupplyChange} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AmountInput
                      label="부가세" hint={isCashNoVat ? '(비적용)' : '(자동 10%)'}
                      value={isCashNoVat ? '0' : vat}
                      onChange={handleVatChange} disabled={isCashNoVat}
                    />
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">잔금 <span className="text-green-500">(자동계산)</span></label>
                      <div className={`w-full border rounded-lg px-3 py-2 text-sm font-semibold ${
                        computedBalance < 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-100 bg-gray-50 text-gray-700'
                      }`}>{fmt(computedBalance)}원</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex justify-between text-xs">
                    <span className="text-gray-500">총액 (공급가액 + 부가세)</span>
                    <span className="font-bold text-gray-800">{fmt(totalAmount)}원</span>
                  </div>
                </div>
              </Section>

              {/* 알림 발송 */}
              <Section title="알림 발송">
                <div className="flex gap-2 mb-3">
                  <select value={notifyType} onChange={e => setNotifyType(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                    <option value="">알림 유형 선택...</option>
                    {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={handleNotify} disabled={sending || !notifyType}
                    className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {sending ? '발송 중...' : '📣 발송'}
                  </button>
                </div>
                {notifyType && (
                  <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                    선택: <span className="font-semibold">{notifyType}</span> → {phone}
                  </div>
                )}
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-100">발송 이력</p>
                  {notifyLogs.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">발송 이력이 없습니다.</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                      {notifyLogs.map((log, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs font-medium text-gray-700">{log.type}</span>
                          <span className="text-xs text-gray-400">{new Date(log.sentAt).toLocaleString('ko-KR')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {/* Google Drive 폴더 */}
              <Section title="Google Drive 폴더">
                <div className="space-y-2">
                  <button onClick={() => setDriveModalOpen(true)}
                    className="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                    <span>📁</span><span>폴더 생성</span>
                  </button>
                  {selected.drive_folder_url && (
                    <a href={selected.drive_folder_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-green-600 hover:text-green-700">
                      <span>🔗</span><span className="truncate">Drive 폴더 열기</span>
                    </a>
                  )}
                  {savedDriveFolder && (
                    <p className="text-xs text-gray-400">기본 위치: 📂 {savedDriveFolder.name}</p>
                  )}
                </div>
              </Section>

              {/* Notion 링크 */}
              {selected.notion_page_id && (
                <a href={`https://notion.so/${selected.notion_page_id.replace(/-/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                  <span>📝</span> Notion에서 보기
                </a>
              )}

              {/* 관리자 메모 */}
              <Section title="관리자 메모">
                <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                  rows={3} placeholder="내부 메모를 입력하세요..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </Section>

              {/* 전체 저장 */}
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? '저장 중...' : '💾 전체 저장'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
