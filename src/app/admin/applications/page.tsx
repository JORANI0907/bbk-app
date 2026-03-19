'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import type { DriveFolder } from '@/lib/googleDrive'

const getDriveLib = () => import('@/lib/googleDrive')

type ServiceType = '1회성케어' | '정기딥케어' | '정기엔드케어'
type ApplicationStatus = '신규' | '검토중' | '계약완료' | '보류' | '거절'

interface User { id: string; name: string; role: string }
interface Worker { id: string; name: string; employment_type: string | null; phone: string | null; account_number: string | null }
interface WorkAssignment { id: string; worker_id: string; construction_date: string | null; business_name: string | null; salary: number | null }
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
  care_scope: string | null
}

interface NotifyLog { type: string; sentAt: string }

type SortField = 'construction_date' | 'created_at' | 'business_name' | 'owner_name' | 'payment_method' | 'status' | 'total_amount'
type SortDir = 'asc' | 'desc'

// ─── 상수 ────────────────────────────────────────────────────
const SERVICE_TYPES: ServiceType[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const STATUS_CONFIG: Record<ApplicationStatus, { color: string; badge: string; dot: string }> = {
  '신규':    { color: 'bg-blue-500 text-white',    badge: 'bg-blue-100 text-blue-700 ring-blue-300',   dot: 'bg-blue-500' },
  '검토중':  { color: 'bg-amber-500 text-white',   badge: 'bg-amber-100 text-amber-700 ring-amber-300', dot: 'bg-amber-500' },
  '계약완료': { color: 'bg-emerald-500 text-white', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-300', dot: 'bg-emerald-500' },
  '보류':    { color: 'bg-gray-400 text-white',    badge: 'bg-gray-100 text-gray-600 ring-gray-300',   dot: 'bg-gray-400' },
  '거절':    { color: 'bg-red-500 text-white',     badge: 'bg-red-100 text-red-700 ring-red-300',     dot: 'bg-red-500' },
}
const NOTIFICATION_TYPES = [
  '예약확정알림', '예약1일전알림', '예약당일알림', '작업완료알림',
  '결제알림', '결제완료알림', '계산서발행완료알림', '예약금환급완료알림',
  '예약취소알림', 'A/S방문알림', '방문견적알림',
]
const NOTIFY_TYPE_CONFIG: Record<string, { badge: string; dot: string }> = {
  '예약확정알림':      { badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  '예약1일전알림':     { badge: 'bg-sky-100 text-sky-700',     dot: 'bg-sky-400' },
  '예약당일알림':      { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  '작업완료알림':      { badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  '결제알림':         { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  '결제완료알림':      { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '계산서발행완료알림': { badge: 'bg-teal-100 text-teal-700',   dot: 'bg-teal-500' },
  '예약금환급완료알림': { badge: 'bg-cyan-100 text-cyan-700',   dot: 'bg-cyan-500' },
  '예약취소알림':      { badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  'A/S방문알림':      { badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  '방문견적알림':      { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
}
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
  status: '계약상태',
  total_amount: '총액',
}

// ─── 알림 이력 (localStorage) ────────────────────────────────
const LOG_KEY = 'bbk_notify_logs'
function loadLogs(appId: string): NotifyLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}')[appId] || [] }
  catch { return [] }
}
function loadAllLogs(): Record<string, NotifyLog[]> {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') }
  catch { return {} }
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
const rowTotal = (app: Application) => {
  const noVat = app.payment_method === '현금(부가세 X)'
  return (app.supply_amount ?? 0) + (noVat ? 0 : (app.vat ?? 0))
}

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
    else if (field === 'total_amount') { va = String(rowTotal(a)).padStart(15, '0'); vb = String(rowTotal(b)).padStart(15, '0') }
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

// ─── Google Drive 폴더 생성/변경 모달 ────────────────────────
function DriveFolderModal({
  businessName, initialDate, onClose,
  onSelectFolder, onConfirm,
  savedFolder, creating,
}: {
  businessName: string
  initialDate: string
  onClose: () => void
  onSelectFolder: () => void
  onConfirm: (date: string, mode: 'create' | 'link') => void
  savedFolder: DriveFolder | null
  creating: boolean
}) {
  const [constructionDate, setConstructionDate] = useState(initialDate || today())
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const dateStr = constructionDate.replace(/-/g, '')
  const folderName = `${dateStr} ${businessName}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-900">📁 Google Drive 폴더 생성/변경</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* 모드 토글 */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              📁 새 폴더 생성
            </button>
            <button
              onClick={() => setMode('link')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'link' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              🔗 기존 폴더 연결
            </button>
          </div>

          {mode === 'create' && (
            <>
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
                <p className="text-xs font-semibold text-gray-500 mb-2">저장 위치 (상위 폴더)</p>
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
                {!savedFolder && <p className="text-xs text-gray-400 mt-1.5">선택한 위치 안에 새 폴더가 생성됩니다.</p>}
              </div>
            </>
          )}

          {mode === 'link' && (
            <>
              <p className="text-sm text-gray-500 bg-blue-50 rounded-xl p-3">
                새 폴더를 만들지 않고, 기존 Drive 폴더를 직접 연결합니다. Picker에서 연결할 폴더를 선택하세요.
              </p>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">연결할 폴더</p>
                {savedFolder ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">📂</span>
                      <span className="text-sm font-medium text-blue-700 truncate">{savedFolder.name}</span>
                    </div>
                    <button onClick={onSelectFolder} className="text-xs text-blue-500 hover:text-blue-700 underline ml-2 shrink-0">다시 선택</button>
                  </div>
                ) : (
                  <button onClick={onSelectFolder}
                    className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                    <span className="text-lg">🗂️</span><span>연결할 폴더 선택</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors">취소</button>
          <button onClick={() => onConfirm(constructionDate, mode)} disabled={!savedFolder || creating}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            {creating ? '⏳ 처리 중...' : mode === 'create' ? '📁 폴더 생성' : '🔗 폴더 연결'}
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
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([])
  const [savedAssignments, setSavedAssignments] = useState<WorkAssignment[]>([])
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState<ServiceType | '전체'>('전체')
  const [selected, setSelected] = useState<Application | null>(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // 정렬
  const [sortField, setSortField] = useState<SortField>('construction_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // 뷰 모드: 전체 | 미배정
  const [viewMode, setViewMode] = useState<'all' | 'unassigned'>('all')

  // 월 필터 (서비스통합관리 뷰)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

  // 필터
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('')
  const [notifyFilter, setNotifyFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // 알림
  const [notifyType, setNotifyType] = useState('')
  const [notifyLogs, setNotifyLogs] = useState<NotifyLog[]>([])
  const [allNotifyLogs, setAllNotifyLogs] = useState<Record<string, NotifyLog[]>>({})

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
  const [careScope, setCareScope] = useState('')
  const [businessHoursStart, setBusinessHoursStart] = useState('')
  const [businessHoursEnd, setBusinessHoursEnd] = useState('')

  const vatManual = useRef(false)

  const isCashNoVat = paymentMethod === '현금(부가세 X)'
  const effectiveVat = isCashNoVat ? 0 : (Number(vat) || 0)
  const totalAmount = (Number(supplyAmount) || 0) + effectiveVat
  const computedBalance = totalAmount - (Number(deposit) || 0)

  useEffect(() => {
    getDriveLib().then(lib => setSavedDriveFolder(lib.getSavedDriveFolder()))
    setAllNotifyLogs(loadAllLogs())
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [appRes, userRes, workerRes] = await Promise.all([
      fetch('/api/admin/applications'),
      fetch('/api/admin/users'),
      fetch('/api/admin/workers'),
    ])
    const appData = await appRes.json()
    const userData = await userRes.json()
    const workerData = await workerRes.json()
    setApplications(appData.applications ?? [])
    setUsers((userData.users ?? []).filter((u: User) => u.role !== 'customer'))
    setWorkers(workerData.workers ?? [])
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
    setCareScope(app.care_scope ?? '')
    setBusinessHoursStart(app.business_hours_start ?? '')
    setBusinessHoursEnd(app.business_hours_end ?? '')
    setNotifyType('')
    setNotifyLogs(loadLogs(app.id))
    setSelectedWorkerIds([])
    setSavedAssignments([])
    setWorkerDropdownOpen(false)
    vatManual.current = false
    // 작업자 배정 이력 로드
    fetch(`/api/admin/work-assignments?application_id=${app.id}`)
      .then(r => r.json())
      .then(d => {
        const asgns: WorkAssignment[] = d.assignments ?? []
        setSavedAssignments(asgns)
        setSelectedWorkerIds(asgns.map((a: WorkAssignment) => a.worker_id))
      })
      .catch(() => { /* workers table 미생성 시 무시 */ })
  }

  const handleWorkerToggle = async (workerId: string) => {
    if (!selected) return
    const isSelected = selectedWorkerIds.includes(workerId)
    if (isSelected) {
      // 제거: 해당 assignment 삭제
      const asgn = savedAssignments.find(a => a.worker_id === workerId)
      if (!asgn) {
        toast.error('배정 데이터를 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도하세요.')
        return
      }
      try {
        const res = await fetch('/api/admin/work-assignments', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: asgn.id }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || '작업자 제거 실패')
        }
        setSavedAssignments(prev => prev.filter(a => a.id !== asgn.id))
        setSelectedWorkerIds(prev => prev.filter(id => id !== workerId))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '작업자 제거 실패')
      }
    } else {
      // 추가: 새 assignment 생성
      try {
        const res = await fetch('/api/admin/work-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: workerId,
            application_id: selected.id,
            construction_date: selected.construction_date ?? null,
            business_name: selected.business_name,
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || '작업자 추가 실패')
        if (d.assignment) setSavedAssignments(prev => [...prev, d.assignment])
        setSelectedWorkerIds(prev => [...prev, workerId])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '작업자 추가 실패')
      }
    }
  }

  const handleSaveToCustomer = async () => {
    if (!selected) return
    const customerType =
      selected.service_type === '정기딥케어' ? '정기딥케어' :
      selected.service_type === '정기엔드케어' ? '정기엔드케어' : '1회성케어'
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: selected.business_name,
          contact_name: selected.owner_name,
          contact_phone: selected.phone,
          email: selected.email,
          address: selected.address,
          business_number: selected.business_number,
          account_number: selected.account_number,
          platform_nickname: selected.platform_nickname,
          payment_method: selected.payment_method,
          business_hours_start: selected.business_hours_start,
          business_hours_end: selected.business_hours_end,
          elevator: selected.elevator,
          building_access: selected.building_access,
          parking_info: selected.parking,
          access_method: selected.access_method,
          special_notes: selected.request_notes,
          customer_type: customerType,
          pipeline_status: 'inquiry',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      toast.success('고객 DB에 저장되었습니다. 고객 관리 탭에서 확인하세요.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    }
  }

  const handleDeleteApplication = async () => {
    if (!selected) return
    if (!confirm(`"${selected.business_name}" 신청서를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    try {
      const res = await fetch(`/api/admin/applications?id=${selected.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      toast.success('삭제되었습니다.')
      setApplications(prev => prev.filter(a => a.id !== selected.id))
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
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
          care_scope: careScope || null,
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
      setAllNotifyLogs(prev => ({ ...prev, [selected.id]: [log, ...(prev[selected.id] || [])].slice(0, 50) }))
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
    } catch (e) { toast.error(e instanceof Error ? e.message : '발송 실패') }
    finally { setSending(false) }
  }

  const handleSelectDriveFolder = async () => {
    try {
      const lib = await getDriveLib()
      await lib.loadGoogleAPIs()
      // 항상 새 토큰 — 같은 계정으로 Picker와 폴더 생성 모두 처리
      const token = await lib.requestGoogleToken()
      setDriveToken(token)
      const picked = await lib.openFolderPicker(token)
      if (picked) {
        // 바로가기(Shortcut)인 경우 실제 폴더 ID로 resolve (실패 시 picked 그대로)
        const folder = await lib.resolveFolder(picked, token)
        setSavedDriveFolder(folder)
        lib.saveDriveFolderCookie(folder)
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Google Drive 연결 실패') }
  }

  const handleConfirmDriveCreate = async (date: string, mode: 'create' | 'link') => {
    if (!selected || !savedDriveFolder) return
    setDriveCreating(true)
    try {
      const lib = await getDriveLib()
      await lib.loadGoogleAPIs()

      let folderUrl: string
      let successMsg: string

      if (mode === 'link') {
        // 기존 폴더 연결 — 새 폴더 생성 없이 선택한 폴더 URL 저장
        folderUrl = `https://drive.google.com/drive/folders/${savedDriveFolder.id}`
        successMsg = `✅ "${savedDriveFolder.name}" 폴더 연결 완료!`
      } else {
        // 새 폴더 구조 생성
        const token = driveToken || await lib.requestGoogleToken()
        setDriveToken(token)
        const result = await lib.createWorkFolderStructure(
          savedDriveFolder.id, selected.business_name, date, token
        )
        folderUrl = result.folderUrl
        successMsg = `✅ "${result.folderName}" 폴더 생성 완료!`
      }

      await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, drive_folder_url: folderUrl, construction_date: date }),
      })
      setConstructionDate(date)
      setSelected(prev => prev ? { ...prev, drive_folder_url: folderUrl, construction_date: date } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, drive_folder_url: folderUrl, construction_date: date } : a))
      setDriveModalOpen(false)
      toast.success(successMsg, { duration: 5000 })
      window.open(folderUrl, '_blank')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '처리 실패'
      const isTrulyMissing = msg.includes('File not found') && !msg.toLowerCase().includes('permission')
      if (isTrulyMissing) {
        toast.error('저장된 Drive 폴더가 삭제되었습니다. 위치를 다시 선택해주세요.', { duration: 5000 })
        setSavedDriveFolder(null)
        document.cookie = 'bbk_drive_folder=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      } else {
        toast.error(`처리 실패: ${msg}`, { duration: 8000 })
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

  const unassignedCount = applications.filter(a => !a.assigned_to).length

  const byType = (type: ServiceType | '전체') => {
    let filtered = type === '전체' ? [...applications] : applications.filter(a => (a.service_type ?? '1회성케어') === type)
    if (viewMode === 'unassigned') filtered = filtered.filter(a => !a.assigned_to)
    if (viewMode === 'all') filtered = filtered.filter(a => a.assigned_to && a.construction_date?.startsWith(selectedMonth))
    if (statusFilter) filtered = filtered.filter(a => a.status === statusFilter)
    if (notifyFilter) filtered = filtered.filter(a => {
      const last = (allNotifyLogs[a.id] || [])[0]
      return last?.type === notifyFilter
    })
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(a =>
        a.business_name.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        (a.address ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.platform_nickname ?? '').toLowerCase().includes(q) ||
        (a.business_number ?? '').toLowerCase().includes(q)
      )
    }
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

      {/* 탭 네비게이션 */}
      <div className="flex gap-1.5 px-1 mb-4 flex-wrap">
        <button
          onClick={() => { setViewMode('all'); setSelected(null) }}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          📋 서비스통합관리
        </button>
        <button
          onClick={() => { setViewMode('unassigned'); setSelected(null) }}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 ${viewMode === 'unassigned' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          ⚠️ 미배정
          {unassignedCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${viewMode === 'unassigned' ? 'bg-white text-orange-500' : 'bg-orange-100 text-orange-600'}`}>
              {unassignedCount}
            </span>
          )}
        </button>
        <a href="/admin/customers" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">👥 고객관리</a>
      </div>

      <div className="relative flex h-full gap-0 min-h-0">
        {/* ── 좌측: 목록 ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {viewMode === 'unassigned' ? '미배정 일정' : '서비스통합관리'}
              </h1>
              {viewMode === 'unassigned' && (
                <p className="text-sm text-orange-600 mt-0.5">담당자가 배정되지 않은 일정입니다. 클릭하여 담당자를 지정하세요.</p>
              )}
            </div>
            <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
          </div>

          {/* 서비스 유형 탭 */}
          <div className="flex border-b border-gray-200 mb-3">
            {(['전체', ...SERVICE_TYPES] as const).map(type => (
              <button key={type}
                onClick={() => { setActiveType(type); setSelected(null) }}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors relative whitespace-nowrap ${activeType === type ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {type}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeType === type ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {byType(type).length}
                </span>
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="업체명, 대표자, 연락처, 주소 검색..."
              className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
            )}
          </div>

          {/* 필터 + 정렬 컨트롤 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* 계약상태 필터 */}
            <div className="flex items-center gap-1.5">
              {statusFilter && <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[statusFilter as ApplicationStatus]?.dot}`} />}
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ApplicationStatus | '')}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6">
                <option value="">계약상태 전체</option>
                {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {/* 최근알림 필터 */}
            <div className="flex items-center gap-1.5">
              {notifyFilter && <span className={`w-2 h-2 rounded-full ${NOTIFY_TYPE_CONFIG[notifyFilter]?.dot}`} />}
              <select value={notifyFilter} onChange={e => setNotifyFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6">
                <option value="">최근알림 전체</option>
                {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* 월 필터 (서비스통합관리 뷰에서만) */}
            {viewMode === 'all' && (
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            {/* 정렬 */}
            <select value={`${sortField}:${sortDir}`}
              onChange={e => {
                const [f, d] = e.target.value.split(':')
                setSortField(f as SortField)
                setSortDir(d as SortDir)
              }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6 ml-auto">
              {(Object.entries(SORT_LABELS) as [SortField, string][]).flatMap(([f, l]) => [
                <option key={`${f}:desc`} value={`${f}:desc`}>{l} ↓</option>,
                <option key={`${f}:asc`} value={`${f}:asc`}>{l} ↑</option>,
              ])}
            </select>
            {/* 필터 초기화 */}
            {(statusFilter || notifyFilter) && (
              <button onClick={() => { setStatusFilter(''); setNotifyFilter('') }}
                className="text-xs text-blue-500 hover:text-blue-700 underline whitespace-nowrap">
                초기화
              </button>
            )}
            {searchQuery && (
              <span className="text-xs text-gray-400 ml-1">"{searchQuery}" 검색 중</span>
            )}
          </div>

          {/* 목록 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1 flex flex-col">
            {loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
            ) : byType(activeType).length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-sm">신청서가 없습니다.</div>
            ) : (() => {
              const rows = byType(activeType)
              const totalSum = rows.reduce((s, a) => s + rowTotal(a), 0)
              return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      {[
                        { label: '시공일자', field: 'construction_date' as SortField },
                        { label: '업체명', field: 'business_name' as SortField },
                        { label: '대표자', field: 'owner_name' as SortField },
                        { label: '담당자', field: null },
                        { label: '작업자', field: null },
                        { label: '결제방법', field: 'payment_method' as SortField },
                        { label: '총액', field: 'total_amount' as SortField },
                        { label: '최근알림', field: null },
                        { label: '계약상태', field: 'status' as SortField },
                      ].map(({ label, field }) => (
                        <th key={label}
                          onClick={field ? () => toggleSort(field) : undefined}
                          className={`text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap ${field ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                          {label}
                          {field && sortField === field && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(app => {
                      const lastLog = (allNotifyLogs[app.id] || [])[0]
                      const notifyCfg = lastLog ? NOTIFY_TYPE_CONFIG[lastLog.type] : null
                      const total = rowTotal(app)
                      return (
                        <tr key={app.id} onClick={() => handleSelect(app)}
                          className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === app.id ? 'bg-blue-50' : ''}`}>
                          <td className="px-3 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                            {app.construction_date ? fmtDate(app.construction_date) : <span className="text-gray-300">미설정</span>}
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-900 max-w-[120px] truncate">{app.business_name}</td>
                          <td className="px-3 py-3 text-gray-700 text-xs">{app.owner_name}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{users.find(u => u.id === app.assigned_to)?.name ?? <span className="text-gray-300">미배정</span>}</td>
                          <td className="px-3 py-3 text-xs">
                            {selected?.id === app.id && selectedWorkerIds.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5">
                                {selectedWorkerIds.slice(0, 2).map(wid => {
                                  const w = workers.find(x => x.id === wid)
                                  return w ? <span key={wid} className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{w.name}</span> : null
                                })}
                                {selectedWorkerIds.length > 2 && <span className="text-gray-400">+{selectedWorkerIds.length - 2}</span>}
                              </div>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{app.payment_method ?? '-'}</td>
                          <td className="px-3 py-3 text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                            {total > 0 ? <>{fmt(total)}<span className="text-gray-400 font-normal">원</span></> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-3">
                            {lastLog && notifyCfg ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${notifyCfg.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${notifyCfg.dot} shrink-0`} />
                                <span className="truncate max-w-[80px]">{lastLog.type.replace('알림', '')}</span>
                              </span>
                            ) : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[app.status]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[app.status]?.dot ?? 'bg-gray-400'} shrink-0`} />
                              {app.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-xs font-semibold text-gray-500">
                        합계 <span className="font-normal text-gray-400">({rows.length}건)</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold text-gray-800 whitespace-nowrap font-mono">
                        {fmt(totalSum)}<span className="text-gray-500 font-normal">원</span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )
            })()}
          </div>
        </div>

        {/* ── 우측: 상세 패널 (오버레이) ── */}
        {selected && (
          <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white rounded-xl border border-gray-200 shadow-2xl overflow-y-auto z-20">
            {/* 헤더 */}
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-2 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-bold text-gray-900">{selected.business_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">신청일: {new Date(selected.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleSaveToCustomer}
                  className="text-xs text-green-600 hover:text-green-800 border border-green-200 hover:border-green-400 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
                >
                  고객 DB 저장
                </button>
                <button
                  onClick={handleDeleteApplication}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors"
                >
                  삭제
                </button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* 계약상태 */}
              <Section title="계약상태">
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                    <button key={s} disabled={saving}
                      onClick={() => quickSave({ status: s })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        selected.status === s
                          ? STATUS_CONFIG[s].color + ' ring-2 ring-offset-1 ring-current'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                      {s}
                    </button>
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

              {/* 담당자 + 작업자 */}
              <Section title="담당자 / 작업자">
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white mb-2">
                  <option value="">담당자 미배정</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>
                  ))}
                </select>
                {/* 작업자 다중선택 */}
                <div className="relative">
                  <button type="button"
                    onClick={() => setWorkerDropdownOpen(o => !o)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
                    <span className="flex flex-wrap gap-1">
                      {selectedWorkerIds.length === 0
                        ? <span className="text-gray-400">작업자 선택 (복수 가능)</span>
                        : selectedWorkerIds.map(wid => {
                            const w = workers.find(x => x.id === wid)
                            return w ? (
                              <span key={wid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                {w.name}
                                <button type="button" onClick={e => { e.stopPropagation(); handleWorkerToggle(wid) }} className="text-indigo-400 hover:text-indigo-700 leading-none">×</button>
                              </span>
                            ) : null
                          })}
                    </span>
                    <span className="text-gray-400 text-xs ml-1 shrink-0">{workerDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {workerDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {workers.length === 0
                        ? <p className="px-3 py-4 text-xs text-gray-400 text-center">직원 관리에서 작업자를 먼저 추가하세요</p>
                        : workers.map(w => {
                          const checked = selectedWorkerIds.includes(w.id)
                          const EMP_COLOR: Record<string, string> = { '정직원': 'bg-green-100 text-green-700', '인턴': 'bg-red-100 text-red-700', '일용직': 'bg-yellow-100 text-yellow-700' }
                          return (
                            <button key={w.id} type="button"
                              onClick={() => handleWorkerToggle(w.id)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${checked ? 'bg-indigo-50' : ''}`}>
                              <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                                {checked && '✓'}
                              </span>
                              <span className="font-medium text-gray-900 flex-1">{w.name}</span>
                              {w.employment_type && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${EMP_COLOR[w.employment_type] ?? 'bg-gray-100 text-gray-600'}`}>{w.employment_type}</span>
                              )}
                              {w.phone && <span className="text-xs text-gray-400">{w.phone}</span>}
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
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

                  {/* 결제방법 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">결제방법</span>
                    <div className="flex-1 space-y-1.5">
                      <select value={PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : '직접입력'}
                        onChange={e => e.target.value === '직접입력' ? handlePaymentMethodChange('') : handlePaymentMethodChange(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        <option value="직접입력">직접입력</option>
                      </select>
                      {!PAYMENT_METHODS.includes(paymentMethod) && (
                        <input value={paymentMethod} onChange={e => handlePaymentMethodChange(e.target.value)}
                          placeholder="결제방법 직접 입력"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
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

                  {/* 엘리베이터 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">엘리베이터</span>
                    <div className="flex-1 space-y-1.5">
                      <select value={ELEVATOR_OPTIONS.includes(elevator) ? elevator : '직접입력'}
                        onChange={e => e.target.value === '직접입력' ? setElevator('') : setElevator(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {ELEVATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        <option value="직접입력">직접입력</option>
                      </select>
                      {!ELEVATOR_OPTIONS.includes(elevator) && (
                        <input value={elevator} onChange={e => setElevator(e.target.value)}
                          placeholder="엘리베이터 상태 직접 입력"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
                    </div>
                  </div>

                  {/* 건물출입 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">건물출입</span>
                    <div className="flex-1 space-y-1.5">
                      <select value={BUILDING_ACCESS_OPTIONS.includes(buildingAccess) ? buildingAccess : '직접입력'}
                        onChange={e => e.target.value === '직접입력' ? setBuildingAccess('') : setBuildingAccess(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {BUILDING_ACCESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        <option value="직접입력">직접입력</option>
                      </select>
                      {!BUILDING_ACCESS_OPTIONS.includes(buildingAccess) && (
                        <input value={buildingAccess} onChange={e => setBuildingAccess(e.target.value)}
                          placeholder="건물출입 방법 직접 입력"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
                    </div>
                  </div>

                  {/* 주차 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">주차</span>
                    <div className="flex-1 space-y-1.5">
                      <select value={PARKING_OPTIONS.includes(parking) ? parking : '직접입력'}
                        onChange={e => e.target.value === '직접입력' ? setParking('') : setParking(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {PARKING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        <option value="직접입력">직접입력</option>
                      </select>
                      {!PARKING_OPTIONS.includes(parking) && (
                        <input value={parking} onChange={e => setParking(e.target.value)}
                          placeholder="주차 정보 직접 입력"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
                    </div>
                  </div>

                  <EditRow label="출입방법" value={accessMethod} onChange={setAccessMethod} />

                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">요청사항</span>
                    <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={2}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">케어범위</span>
                    <textarea value={careScope} onChange={e => setCareScope(e.target.value)} rows={3}
                      placeholder="케어 범위를 입력하세요&#10;예) 주방, 화장실 2개, 사무실 전체"
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
                      {notifyLogs.map((log, i) => {
                        const cfg = NOTIFY_TYPE_CONFIG[log.type]
                        return (
                          <div key={i} className="flex items-center justify-between px-3 py-2 gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot ?? 'bg-gray-400'} shrink-0`} />
                              {log.type}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">{new Date(log.sentAt).toLocaleString('ko-KR')}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Section>

              {/* Google Drive 폴더 */}
              <Section title="Google Drive 폴더">
                <div className="space-y-2">
                  <button onClick={() => setDriveModalOpen(true)}
                    className="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                    <span>📁</span><span>폴더 생성/변경</span>
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
