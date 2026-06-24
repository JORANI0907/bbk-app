'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { Worker } from './constants'

interface Props {
  worker: Worker
  onWorkerUpdated: (w: Worker) => void
  onWorkerDeleted: (id: string) => void
}

const EMP_BADGE: Record<string, string> = {
  '정직원': 'bg-emerald-100 text-emerald-700',
  '인턴':   'bg-purple-100 text-purple-700',
  '일용직': 'bg-amber-100 text-amber-700',
}

function Field({ label, value, onChange, type = 'text', mono, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  mono?: boolean
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 shrink-0 text-right">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 shrink-0 text-right">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">선택</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-gray-100">
      <span className="text-base">{icon}</span>
      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</span>
    </div>
  )
}

interface UserAccount { id: string; name: string; phone: string }

export default function WorkerDetail({ worker, onWorkerUpdated, onWorkerDeleted }: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [allAccounts, setAllAccounts] = useState<UserAccount[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [privacyExpanded, setPrivacyExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/workers?accounts=true')
      .then(r => r.json())
      .then(d => setAllAccounts(d.accounts ?? []))
  }, [])

  const linkedAccount = allAccounts.find(u => u.id === worker.user_id) ?? null
  const availableAccounts = allAccounts.filter(u => u.id !== worker.user_id)

  const handleLink = async () => {
    if (!selectedUserId) return
    setLinkSaving(true)
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: worker.id, user_id: selectedUserId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '연결 실패')
      toast.success('앱 계정이 연결되었습니다.')
      setSelectedUserId('')
      onWorkerUpdated({ ...worker, user_id: selectedUserId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '연결 실패')
    } finally {
      setLinkSaving(false)
    }
  }

  const handleUnlink = async () => {
    if (!confirm('앱 계정 연결을 해제하시겠습니까?')) return
    setLinkSaving(true)
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: worker.id, user_id: null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '해제 실패')
      toast.success('연결이 해제되었습니다.')
      onWorkerUpdated({ ...worker, user_id: null })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '해제 실패')
    } finally {
      setLinkSaving(false)
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoUploading(true)
    try {
      const { default: imageCompression } = await import('browser-image-compression')
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 800, useWebWorker: true })

      const fd = new FormData()
      fd.append('file', compressed, file.name)
      fd.append('workerId', worker.id)

      const res = await fetch('/api/admin/workers/upload-photo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '업로드 실패')

      toast.success('사진이 업데이트되었습니다.')
      onWorkerUpdated({ ...worker, photo_url: json.photo_url })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const [form, setForm] = useState({
    name: worker.name ?? '',
    employment_type: worker.employment_type ?? '',
    phone: worker.phone ?? '',
    email: worker.email ?? '',
    birth_date: worker.birth_date ?? '',
    gender: worker.gender ?? '',
    blood_type: worker.blood_type ?? '',
    home_address: worker.home_address ?? '',
    department: worker.department ?? '',
    position: worker.position ?? '',
    job_title: worker.job_title ?? '',
    join_date: worker.join_date ?? '',
    specialties: worker.specialties ?? '',
    skill_level: worker.skill_level ?? '',
    account_number: worker.account_number ?? '',
    day_wage: worker.day_wage?.toString() ?? '',
    night_wage: worker.night_wage?.toString() ?? '',
    avg_salary: worker.avg_salary?.toString() ?? '',
    personal_id: worker.personal_id ?? '',
    emergency_contact: worker.emergency_contact ?? '',
    anniversary: worker.anniversary ?? '',
    hobby: worker.hobby ?? '',
  })

  useEffect(() => {
    setForm({
      name: worker.name ?? '',
      employment_type: worker.employment_type ?? '',
      phone: worker.phone ?? '',
      email: worker.email ?? '',
      birth_date: worker.birth_date ?? '',
      gender: worker.gender ?? '',
      blood_type: worker.blood_type ?? '',
      home_address: worker.home_address ?? '',
      department: worker.department ?? '',
      position: worker.position ?? '',
      job_title: worker.job_title ?? '',
      join_date: worker.join_date ?? '',
      specialties: worker.specialties ?? '',
      skill_level: worker.skill_level ?? '',
      account_number: worker.account_number ?? '',
      day_wage: worker.day_wage?.toString() ?? '',
      night_wage: worker.night_wage?.toString() ?? '',
      avg_salary: worker.avg_salary?.toString() ?? '',
      personal_id: worker.personal_id ?? '',
      emergency_contact: worker.emergency_contact ?? '',
      anniversary: worker.anniversary ?? '',
      hobby: worker.hobby ?? '',
    })
    setPrivacyExpanded(false)
  }, [worker.id])

  const setField = (key: keyof typeof form) => (v: string) =>
    setForm(prev => ({ ...prev, [key]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('이름을 입력하세요.'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: worker.id,
        name: form.name.trim(),
        employment_type: form.employment_type || null,
        phone: form.phone || null,
        email: form.email || null,
        birth_date: form.birth_date || null,
        gender: form.gender || null,
        blood_type: form.blood_type || null,
        home_address: form.home_address || null,
        account_number: form.account_number || null,
        specialties: form.specialties || null,
        anniversary: form.anniversary || null,
        hobby: form.hobby || null,
        personal_id: form.personal_id || null,
        emergency_contact: form.emergency_contact || null,
      }

      const isPartTime = form.employment_type !== '정직원'
      if (isPartTime) {
        body.skill_level = form.skill_level || null
        body.day_wage = form.day_wage ? Number(form.day_wage) : null
        body.night_wage = form.night_wage ? Number(form.night_wage) : null
        body.department = null; body.position = null; body.job_title = null
        body.avg_salary = null; body.join_date = null
      } else {
        body.department = form.department || null
        body.position = form.position || null
        body.job_title = form.job_title || null
        body.avg_salary = form.avg_salary ? Number(form.avg_salary) : null
        body.join_date = form.join_date || null
        body.skill_level = null; body.day_wage = null; body.night_wage = null
      }

      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      toast.success('저장되었습니다.')
      onWorkerUpdated({ ...worker, ...body } as Worker)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`${worker.name}을(를) 삭제하시겠습니까?`)) return
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: worker.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '삭제 실패')
      toast.success('삭제되었습니다.')
      onWorkerDeleted(worker.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleDownloadPDF = async () => {
    setPdfLoading(true)
    try {
      const [{ pdf }, { createElement }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
      ])
      const { WorkerPDFDocument } = await import('./WorkerPDF')

      const workerForPDF: Worker = {
        ...worker,
        name: form.name,
        employment_type: form.employment_type || null,
        birth_date: form.birth_date || null,
        gender: form.gender || null,
        blood_type: form.blood_type || null,
        phone: form.phone || null,
        email: form.email || null,
        home_address: form.home_address || null,
        department: form.department || null,
        position: form.position || null,
        job_title: form.job_title || null,
        join_date: form.join_date || null,
        skill_level: form.skill_level || null,
        specialties: form.specialties || null,
        account_number: form.account_number || null,
        day_wage: form.day_wage ? Number(form.day_wage) : null,
        night_wage: form.night_wage ? Number(form.night_wage) : null,
        avg_salary: form.avg_salary ? Number(form.avg_salary) : null,
        emergency_contact: form.emergency_contact || null,
      }

      const blob = await pdf(createElement(WorkerPDFDocument, { worker: workerForPDF })).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `인사카드_${worker.name}_${new Date().toLocaleDateString('ko-KR')}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('PDF 저장 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF 생성 실패')
    } finally {
      setPdfLoading(false)
    }
  }

  const isPartTime = form.employment_type !== '정직원'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="bg-white p-5 flex flex-col gap-5">

        {/* ── 상단 헤더: 사진 + 이름/뱃지/상태 ── */}
        <div className="flex items-start gap-4 pb-4 border-b border-gray-100">
          {/* 사진 */}
          <div className="relative shrink-0">
            <div
              onClick={() => photoInputRef.current?.click()}
              className="w-20 h-24 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors"
            >
              {worker.photo_url ? (
                <img src={worker.photo_url} alt="직원사진" className="w-full h-full object-cover" />
              ) : (
                <>
                  <span className="text-2xl mb-1">📷</span>
                  <span className="text-[10px] text-gray-400">사진 추가</span>
                </>
              )}
              {photoUploading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <span className="text-[10px] text-blue-600">업로드 중...</span>
                </div>
              )}
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          {/* 이름/뱃지 */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{worker.name}</h2>
              {worker.employment_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EMP_BADGE[worker.employment_type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {worker.employment_type}
                </span>
              )}
            </div>
            {form.department && !isPartTime && (
              <p className="text-xs text-gray-500 mb-0.5">{form.department} {form.position && `· ${form.position}`}</p>
            )}
            {form.job_title && !isPartTime && (
              <p className="text-xs text-gray-400">{form.job_title}</p>
            )}
            {isPartTime && form.skill_level && (
              <p className="text-xs text-gray-500">숙련도: {form.skill_level}</p>
            )}
            {/* 앱 연결 상태 */}
            <div className="mt-2">
              {linkedAccount
                ? <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">📱 {linkedAccount.name} 앱 연결됨</span>
                : <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">앱 미연결</span>
              }
            </div>
          </div>
        </div>

        {/* ── 섹션 1: 인적사항 ── */}
        <div>
          <SectionTitle icon="👤" title="인적사항" />
          <div className="flex flex-col gap-2.5">
            <Field label="이름" value={form.name} onChange={setField('name')} />
            <SelectField label="고용형태" value={form.employment_type} options={['정직원', '인턴', '일용직']} onChange={setField('employment_type')} />
            <Field label="생년월일" value={form.birth_date} onChange={setField('birth_date')} type="date" />
            <SelectField label="성별" value={form.gender} options={['남', '여']} onChange={setField('gender')} />
            <SelectField label="혈액형" value={form.blood_type} options={['A', 'B', 'O', 'AB']} onChange={setField('blood_type')} />
            <Field label="연락처" value={form.phone} onChange={setField('phone')} placeholder="010-0000-0000" />
            <Field label="이메일" value={form.email} onChange={setField('email')} type="email" />
            <Field label="집주소" value={form.home_address} onChange={setField('home_address')} />
          </div>
        </div>

        {/* ── 섹션 2: 직무 정보 ── */}
        <div>
          <SectionTitle icon="💼" title="직무 정보" />
          <div className="flex flex-col gap-2.5">
            {!isPartTime ? (
              <>
                <SelectField label="부서" value={form.department} options={['본부', '딥케어', '엔드케어']} onChange={setField('department')} />
                <Field label="직급" value={form.position} onChange={setField('position')} placeholder="사원/대리/과장..." />
                <Field label="직책" value={form.job_title} onChange={setField('job_title')} placeholder="팀장/매니저..." />
                <Field label="입사일" value={form.join_date} onChange={setField('join_date')} type="date" />
              </>
            ) : (
              <>
                <SelectField label="숙련도" value={form.skill_level} options={['상', '중', '하']} onChange={setField('skill_level')} />
              </>
            )}
            <Field label="특화작업" value={form.specialties} onChange={setField('specialties')} placeholder="후드/에어컨/바닥..." />
          </div>
        </div>

        {/* ── 섹션 3: 급여 정보 ── */}
        <div>
          <SectionTitle icon="💰" title="급여 정보" />
          <div className="flex flex-col gap-2.5">
            <Field label="계좌번호" value={form.account_number} onChange={setField('account_number')} mono placeholder="은행명 + 계좌번호" />
            {isPartTime ? (
              <>
                <Field label="주간 일당" value={form.day_wage} onChange={setField('day_wage')} type="number" placeholder="원" />
                <Field label="야간 일당" value={form.night_wage} onChange={setField('night_wage')} type="number" placeholder="원" />
              </>
            ) : (
              <Field label="월 급여" value={form.avg_salary} onChange={setField('avg_salary')} type="number" placeholder="원" />
            )}
          </div>
        </div>

        {/* ── 섹션 4: 보호 정보 (접이식) ── */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setPrivacyExpanded(v => !v)}
            className="w-full flex items-center justify-between p-3 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span>🔒</span>
              <span className="uppercase tracking-wide">개인보호 정보</span>
            </div>
            <span className="text-gray-400">{privacyExpanded ? '▲' : '▼'}</span>
          </button>
          {privacyExpanded && (
            <div className="p-4 flex flex-col gap-2.5 bg-gray-50 border-t border-gray-100">
              <Field label="주민번호" value={form.personal_id} onChange={setField('personal_id')} mono placeholder="000000-0000000" />
              <Field label="비상연락처" value={form.emergency_contact} onChange={setField('emergency_contact')} placeholder="이름 연락처" />
              <Field label="기념일" value={form.anniversary} onChange={setField('anniversary')} />
              <Field label="취미/특기" value={form.hobby} onChange={setField('hobby')} />
            </div>
          )}
        </div>

        {/* ── 섹션 5: 앱 계정 연결 ── */}
        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
          <SectionTitle icon="📱" title="앱 계정 연결" />
          <p className="text-[11px] text-gray-400 -mt-2">연결된 계정이 있어야 배정된 일정이 작업자 앱에 표시됩니다.</p>

          {linkedAccount ? (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-emerald-800">{linkedAccount.name}</p>
                <p className="text-[11px] text-emerald-600">{linkedAccount.phone}</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={linkSaving}
                className="text-[11px] text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                연결 해제
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-[11px] text-amber-700">미연결 — 배정 일정이 앱에 표시되지 않습니다.</span>
              </div>
              {availableAccounts.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">계정 선택</option>
                    {availableAccounts.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleLink}
                    disabled={!selectedUserId || linkSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {linkSaving ? '연결 중...' : '연결'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 text-center py-1">연결 가능한 앱 계정이 없습니다.</p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── 하단 액션 버튼 ── */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2.5 rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex-1 bg-gray-700 hover:bg-gray-800 text-white text-xs py-2.5 rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            {pdfLoading ? 'PDF 변환 중...' : '📄 PDF 저장'}
          </button>
        </div>
        <button
          onClick={handleDelete}
          className="w-full text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 py-2 rounded-lg transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  )
}
