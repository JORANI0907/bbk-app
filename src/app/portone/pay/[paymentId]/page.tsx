'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { requestPayment } from '@portone/browser-sdk/v2'
import { KbEscrowBadge } from '@/components/KbEscrowBadge'

type AppInfo = {
  id?: string
  owner_name: string
  business_name: string
  business_number?: string | null
  phone: string
  phone_2?: string | null
  email: string
  address?: string | null
  service_type?: string | null
  care_scope?: string | null
  space_size?: string | null
  access_method?: string | null
  building_access?: string | null
  elevator?: string | null
  parking?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  construction_date?: string | null
  construction_time?: string | null
  meeting_time?: string | null
  request_notes?: string | null
  customer_memo?: string | null
  deposit: number
  supply_amount: number
  vat: number
  payment_method: string
  payment_status?: string | null
  virtual_account_number?: string
  virtual_account_bank?: string
  virtual_account_expired_at?: string
  deposit_paid_at?: string
  balance_paid_at?: string
}

// 편집 가능한 필드 정의 — /bbk-care 신청서(form.html)에 있는 필드만
// type: text(기본) / tel / email / time / textarea / select
// options: select일 때 옵션 리스트
type EditableField = {
  key: keyof AppInfo
  label: string
  type?: 'text' | 'tel' | 'email' | 'time' | 'textarea' | 'select'
  options?: string[]
}
const EDITABLE_FIELD_LABELS: EditableField[] = [
  { key: 'business_name',        label: '상호'                                         },
  { key: 'business_number',      label: '사업자등록번호'                                },
  { key: 'address',              label: '주소'                                         },
  { key: 'business_hours_start', label: '영업 시작', type: 'time'                       },
  { key: 'business_hours_end',   label: '영업 종료', type: 'time'                       },
  { key: 'owner_name',           label: '대표자'                                        },
  { key: 'phone',                label: '연락처',    type: 'tel'                        },
  { key: 'email',                label: '이메일',    type: 'email'                      },
  { key: 'elevator',             label: '엘리베이터', type: 'select', options: ['가능', '불가', '해당없음'] },
  { key: 'building_access',      label: '건물 출입', type: 'select', options: ['필요', '불필요'] },
  { key: 'parking',              label: '주차',      type: 'select', options: ['건물 전용주차장', '건물 주변 주차가능', '주차공간 없음', '직접입력'] },
  { key: 'access_method',        label: '출입 방법', type: 'textarea'                   },
  { key: 'request_notes',        label: '요청사항',  type: 'textarea'                   },
]

type Stage = 'deposit' | 'balance'
type Method = 'card' | 'vbank' | 'transfer'

function calcBalance(supply: number, vat: number, deposit: number) {
  return (supply + vat) - deposit
}

function inferMethodFromPaymentMethod(pm: string | undefined | null): Method {
  if (pm === '계좌이체') return 'transfer'
  if (pm === '가상계좌' || pm === '현금(계산서 희망)') return 'vbank'
  return 'card'
}

const METHOD_TO_PAYMENT_METHOD: Record<Method, '카드(온라인 간편결제)' | '가상계좌' | '계좌이체'> = {
  card:     '카드(온라인 간편결제)',
  vbank:    '가상계좌',
  transfer: '계좌이체',
}

// ─── SVG 아이콘 ───────────────────────────────
function CardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}
function BankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" />
      <path d="M4 10v11" /><path d="M20 10v11" />
      <path d="M8 14v3" /><path d="M12 14v3" /><path d="M16 14v3" />
    </svg>
  )
}
function TransferIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10h13l-3-3" /><path d="M17 14H4l3 3" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}
function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  )
}

export default function PortOnePayPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const paymentId    = params.paymentId as string
  const stage        = (searchParams.get('stage') ?? 'deposit') as Stage
  const appId        = searchParams.get('appId') ?? ''
  const custId       = searchParams.get('custId') ?? ''

  const [app,     setApp]     = useState<AppInfo | null>(null)
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'paying' | 'switching' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [selectedMethod, setSelectedMethod] = useState<Method>('card')

  // 상세보기 모달 상태 — 개별 필드 편집 방식
  const [detailOpen,    setDetailOpen]    = useState(false)
  const [editingKey,    setEditingKey]    = useState<keyof AppInfo | null>(null)
  const [editingValue,  setEditingValue]  = useState('')
  const [saveState,     setSaveState]     = useState<'idle' | 'saving' | 'error'>('idle')
  const [saveMessage,   setSaveMessage]   = useState('')

  const amount = useMemo(() =>
    app
      ? stage === 'deposit'
        ? app.deposit
        : calcBalance(app.supply_amount, app.vat, app.deposit)
      : 0
  , [app, stage])

  const totalAmount = useMemo(() =>
    app ? Number(app.supply_amount || 0) + Number(app.vat || 0) : 0
  , [app])
  const balanceAmount = useMemo(() =>
    app ? calcBalance(app.supply_amount, app.vat, app.deposit) : 0
  , [app])

  const alreadyPaid = stage === 'deposit'
    ? Boolean(app?.deposit_paid_at)
    : Boolean(app?.balance_paid_at)

  useEffect(() => {
    if (!appId && !custId) { setStatus('error'); setMessage('잘못된 접근입니다.'); return }
    const q = custId ? `custId=${custId}` : `appId=${appId}`
    fetch(`/api/portone/pay-info?${q}`)
      .then(r => r.json())
      .then(d => {
        setApp(d.app)
        setSelectedMethod(inferMethodFromPaymentMethod(d.app?.payment_method))
        setStatus('idle')
      })
      .catch(() => { setStatus('error'); setMessage('결제 정보를 불러오는 중 오류가 발생했습니다.') })
  }, [appId, custId])

  // 결제 수단 전환 — 서버에 payment_method 업데이트 후 신청서 재조회
  const switchMethod = useCallback(async (next: Method) => {
    console.log('[pay] switchMethod 호출됨:', { current: selectedMethod, next, appReady: !!app, status })
    if (!app) { console.warn('[pay] app 없음, skip'); return }
    if (next === selectedMethod) { console.warn('[pay] 이미 선택된 방법, skip'); return }
    if (status === 'paying') { console.warn('[pay] 결제 진행 중, skip'); return }

    setStatus('switching')
    setMessage('')
    try {
      const overridePaymentMethod = METHOD_TO_PAYMENT_METHOD[next]
      const idBody = appId ? { applicationId: appId } : { customerId: custId }
      console.log('[pay] issue-payment-link 요청:', { overridePaymentMethod })
      const res = await fetch('/api/portone/issue-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...idBody, stage, overridePaymentMethod }),
      })
      console.log('[pay] issue-payment-link 응답:', res.status)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error ?? '결제 정보 갱신에 실패했습니다.')
      }
      const q = custId ? `custId=${custId}` : `appId=${appId}`
      const infoRes = await fetch(`/api/portone/pay-info?${q}`)
      const infoData = await infoRes.json()
      setApp(infoData.app)
      setSelectedMethod(next)   // 서버 성공 후에만 UI 변경 → 롤백 이슈 원천 차단
      setStatus('idle')
      console.log('[pay] switchMethod 완료')
    } catch (e) {
      console.error('[pay] switchMethod 에러:', e)
      setStatus('idle')  // 방법 변경 실패 → 현재 방법 유지, 안내 배너 표시
      setMessage(e instanceof Error ? e.message : '결제방법 전환 중 오류가 발생했습니다.')
    }
  }, [selectedMethod, app, appId, custId, stage, status])

  // 모달 열기
  const openDetail = useCallback(() => {
    setEditingKey(null)
    setEditingValue('')
    setSaveState('idle')
    setSaveMessage('')
    setDetailOpen(true)
  }, [])

  // 특정 필드 편집 시작
  const startEdit = useCallback((key: keyof AppInfo) => {
    if (!app) return
    setEditingKey(key)
    setEditingValue(String(app[key] ?? ''))
    setSaveState('idle')
    setSaveMessage('')
  }, [app])

  const cancelEdit = useCallback(() => {
    setEditingKey(null)
    setEditingValue('')
    setSaveState('idle')
    setSaveMessage('')
  }, [])

  // 편집 중인 필드 하나만 저장 — application-update API 호출
  const saveField = useCallback(async () => {
    if (!appId || !editingKey) return
    setSaveState('saving')
    setSaveMessage('')
    try {
      const res = await fetch('/api/portone/application-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, updates: { [editingKey]: editingValue } }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data?.error ?? '저장에 실패했습니다.')
      }
      // 최신 데이터 재조회 — app 전체 갱신
      const infoRes = await fetch(`/api/portone/pay-info?appId=${appId}`)
      const infoData = await infoRes.json()
      setApp(infoData.app)
      setEditingKey(null)
      setEditingValue('')
      setSaveState('idle')
    } catch (e) {
      setSaveState('error')
      setSaveMessage(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.')
    }
  }, [appId, editingKey, editingValue])

  const handlePay = useCallback(async () => {
    if (!app) return
    setStatus('paying')
    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
      const isTransfer = selectedMethod === 'transfer'
      const channelKey = isTransfer
        ? (process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TRANSFER ?? '')
        : (process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD ?? '')
      const payMethod: 'CARD' | 'TRANSFER' = isTransfer ? 'TRANSFER' : 'CARD'
      // 진단: 브라우저가 실제 사용하는 채널키·storeId 확인용 (F12 콘솔)
      console.log('[pay] requestPayment 준비:', {
        storeId,
        channelKey,
        channelKeyPrefix: channelKey.slice(0, 20) + '...',
        payMethod,
        amount,
      })
      const emailToUse = (app.email && app.email.trim())
        || `noemail-${appId.replace(/-/g, '').slice(0, 8)}@bbkorea.co.kr`

      const result = await requestPayment({
        storeId, channelKey, paymentId,
        orderName: `범빌드코리아 청소서비스 — ${app.business_name}`,
        totalAmount: amount, currency: 'KRW', payMethod,
        customer: {
          fullName: app.owner_name,
          phoneNumber: app.phone.replace(/-/g, ''),
          email: emailToUse,
        },
      })
      if (!result || 'code' in result) {
        const errCode = String((result as { code?: string } | undefined)?.code ?? '')
        const errMsg  = String((result as { message?: string } | undefined)?.message ?? '')
        // 사용자 취소는 정상 흐름 — 결제 화면으로 조용히 복구
        const isUserCancel = errCode.toUpperCase().includes('CANCEL') || errMsg.includes('취소')
        if (isUserCancel) {
          setStatus('idle')
          setMessage('')
          return
        }
        // 나머지 SDK 오류는 idle + 배너로 안내 (error 전체 화면 대신)
        setStatus('idle')
        setMessage(errMsg || '결제 창에서 오류가 발생했습니다.')
        return
      }
      const verifyRes = await fetch('/api/portone/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          applicationId: appId || undefined,
          customerId:    custId || undefined,
          stage,
        }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok || !verifyData.success) {
        // READY 상태(승인 대기)는 성공에 준하게 안내 — 웹훅으로 최종 확정됨
        if (verifyData.status === 'READY') {
          setStatus('success')
          setMessage('결제 요청이 접수되었습니다. 승인 완료 시 문자로 안내드립니다.')
          return
        }
        setStatus('error')
        setMessage(verifyData.error ?? '결제 검증에 실패했습니다.')
        return
      }
      setStatus('success')
      setMessage('결제가 완료되었습니다. 감사합니다!')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '결제 중 오류가 발생했습니다.')
    }
  }, [app, amount, appId, custId, paymentId, stage, selectedMethod])

  // ─── 상태 화면 ─────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #F5F1EB 100%)' }}>
        <div className="text-stone-400 text-sm animate-pulse">로딩 중...</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #F5F1EB 100%)' }}>
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-stone-900 font-bold text-lg mb-2">잠시 문제가 발생했어요</p>
          <p className="text-stone-500 text-sm mb-6 leading-relaxed">{message}</p>
          <p className="text-stone-400 text-xs">문의 · 1522-9597</p>
        </div>
      </div>
    )
  }

  if (status === 'success' || alreadyPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(180deg, #F0FDF9 0%, #E6FFFA 100%)' }}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg" style={{ background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' }}>
            <CheckIcon className="w-10 h-10 text-white" />
          </div>
          <p className="text-emerald-900 font-black text-2xl mb-3 tracking-tight">
            {message && message.includes('접수') ? '결제 요청이 접수됐어요' : '결제가 완료되었어요'}
          </p>
          <p className="text-stone-600 text-sm mb-8 leading-relaxed whitespace-pre-line">
            {alreadyPaid
              ? '이미 결제가 완료된 건입니다.'
              : (message || '서비스 예약이 안전하게 접수되었습니다.\n담당자가 확인 후 예약 확정을 안내드릴게요.')}
          </p>
          <p className="text-stone-400 text-xs">범빌드코리아 · 1522-9597</p>
        </div>
      </div>
    )
  }

  // ─── 결제방법 옵션 ────────────────────────────────────
  const methods: Array<{ key: Method; title: string; desc: string; Icon: (p: { className?: string }) => JSX.Element; color: string }> = [
    { key: 'card',     title: '신용/체크카드',    desc: '카드로 즉시 결제',           Icon: CardIcon,     color: 'emerald' },
    { key: 'transfer', title: '실시간 계좌이체',  desc: '오픈뱅킹으로 즉시 이체',      Icon: TransferIcon, color: 'sky' },
    { key: 'vbank',    title: '가상계좌',        desc: '발급받은 계좌로 입금',        Icon: BankIcon,     color: 'amber' },
  ]

  const isVbankSelected = selectedMethod === 'vbank'
  const isSwitching     = status === 'switching'
  const isPaying        = status === 'paying'

  const stageLabel = stage === 'deposit' ? '1차 결제' : '2차 결제 (잔금)'
  const stageDesc  = stage === 'deposit'
    ? '서비스 예약을 확정하기 위한 1차 결제입니다.'
    : '작업 완료 후 진행되는 최종 잔금 결제입니다.'

  return (
    <div className="min-h-screen pb-24" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #FBF6EE 40%, #F5F1EB 100%)' }}>
      {/* 상단 헤더 */}
      <div className="bg-white/70 backdrop-blur-md border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-7 h-7">
              <Image src="/bbk-logo.png" alt="BBK 로고" fill sizes="28px" className="object-contain" priority />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[8px] font-semibold text-stone-400 tracking-[0.15em]">BUMBUILD KOREA</span>
              <span className="text-[13px] font-bold text-stone-800 mt-0.5">범빌드코리아</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
            <LockIcon className="w-3 h-3" />
            <span>SSL 보안결제</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-3 space-y-2.5">
        {/* 결제 진행 단계 4단계 — 신청서 · 1차결제 · 작업완료 · 2차결제 */}
        {(() => {
          const steps: Array<{ label: string; state: 'done' | 'current' | 'future' }> = [
            { label: '신청서',   state: 'done' },
            { label: '1차 결제', state: stage === 'balance' ? 'done' : 'current' },
            { label: '작업 완료', state: stage === 'balance' ? 'done' : 'future' },
            { label: '2차 결제', state: stage === 'balance' ? 'current' : 'future' },
          ]
          return (
            <div className="flex items-start w-full">
              {steps.map((s, i) => (
                <div key={s.label} className={`flex items-start ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      s.state === 'done'
                        ? 'bg-emerald-400 text-white shadow-sm'
                        : s.state === 'current'
                          ? 'bg-gradient-to-br from-emerald-300 to-emerald-400 text-white shadow-sm ring-2 ring-emerald-100'
                          : 'bg-stone-200 text-stone-500'
                    }`}>
                      {s.state === 'done' ? <CheckIcon className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-[9px] font-semibold text-center leading-tight whitespace-nowrap ${
                      s.state === 'current' ? 'text-emerald-600' :
                      s.state === 'done'    ? 'text-stone-600'   : 'text-stone-400'
                    }`}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded mt-2 ${
                      steps[i + 1].state !== 'future' ? 'bg-emerald-300' : 'bg-stone-200'
                    }`}></div>
                  )}
                </div>
              ))}
            </div>
          )
        })()}

        {/* 1차 결제 통합 카드 — 헤더·금액·서비스 총액·2차 결제 안내 모두 병합 */}
        <section className="relative bg-white/85 backdrop-blur rounded-2xl px-4 py-3 border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-gradient-to-b from-amber-300 to-amber-400"></div>
          {/* 상단: 제목 + 금액 */}
          <div className="pl-2 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-stone-900 tracking-tight mb-0.5">{stageLabel}</h1>
              <p className="text-[11px] text-stone-500 leading-relaxed">{stageDesc}</p>
            </div>
            <div className="flex items-baseline flex-shrink-0">
              <span className="text-2xl font-black text-emerald-600 tracking-tight" style={{ fontFamily: 'system-ui, sans-serif' }}>
                {amount.toLocaleString('ko-KR')}
              </span>
              <span className="text-sm font-semibold ml-0.5 text-emerald-600/80">원</span>
            </div>
          </div>
          {/* 하단: 총액/잔금 요약 + 2차 안내 */}
          {stage === 'deposit' && (
            <div className="mt-2 pt-2 pl-2 border-t border-stone-100 space-y-1">
              {totalAmount > 0 && (
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>총 서비스 금액 (VAT 포함) · 2차 결제(잔금) 예정</span>
                  <span className="font-semibold text-stone-700">
                    {totalAmount.toLocaleString('ko-KR')}원 · <span className="text-sky-600">{balanceAmount.toLocaleString('ko-KR')}원</span>
                  </span>
                </div>
              )}
              <p className="text-[10px] text-stone-500 leading-relaxed">
                <span className="font-semibold text-sky-600">2차 결제(잔금)</span> · 서비스 완료 후 문자로 결제 링크 안내 (카드·계좌이체·가상계좌)
              </p>
            </div>
          )}
        </section>

        {/* 주문 정보 */}
        <section className="bg-white/80 backdrop-blur rounded-2xl border border-stone-200/60 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-stone-800">주문 정보</h2>
            <button
              type="button"
              onClick={openDetail}
              disabled={!appId || Boolean(app?.deposit_paid_at)}
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-stone-400 disabled:cursor-not-allowed transition-colors"
            >
              {app?.deposit_paid_at ? '결제완료' : '상세보기 ›'}
            </button>
          </div>
          <div className="px-4 py-2.5 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-stone-500">상호</span>
              <span className="text-[12px] font-medium text-stone-800">{app?.business_name || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-stone-500">주문자</span>
              <span className="text-[12px] font-medium text-stone-800">{app?.owner_name || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-stone-500">서비스</span>
              <span className="text-[12px] font-medium text-stone-800">{app?.service_type || '청소 서비스'}</span>
            </div>
          </div>
        </section>

        {/* 결제 수단 선택 */}
        <section className="bg-white/80 backdrop-blur rounded-2xl border border-stone-200/60 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-stone-100">
            <h2 className="text-[13px] font-bold text-stone-800">결제 수단</h2>
          </div>
          <div className="p-1.5">
            {methods.map((m) => {
              const active = selectedMethod === m.key
              // 활성 색상: 채도 낮춘 파스텔 (bg-*-50/60로 배경 크림이 배어 나오게)
              const colorClass = m.color === 'emerald'
                ? { bg: 'from-emerald-50/70 to-teal-50/60', border: 'border-emerald-200/70', icon: 'bg-emerald-100/80 text-emerald-500', dot: 'bg-emerald-400' }
                : m.color === 'sky'
                ? { bg: 'from-sky-50/70 to-blue-50/60',    border: 'border-sky-200/70',    icon: 'bg-sky-100/80 text-sky-500',       dot: 'bg-sky-400' }
                : { bg: 'from-amber-50/70 to-orange-50/60',border: 'border-amber-200/70',  icon: 'bg-amber-100/80 text-amber-500',   dot: 'bg-amber-400' }
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    console.log('[pay] 버튼 클릭 이벤트 발생:', m.key)
                    switchMethod(m.key)
                  }}
                  disabled={isPaying || isSwitching}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border-2 ${
                    active
                      ? `bg-gradient-to-br ${colorClass.bg} ${colorClass.border}`
                      : 'bg-white border-transparent hover:bg-stone-50/80 active:scale-[0.99]'
                  } ${(isPaying || isSwitching) ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    active ? colorClass.icon : 'bg-stone-100 text-stone-400'
                  }`}>
                    <m.Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className={`text-[13px] font-semibold ${active ? 'text-stone-900' : 'text-stone-700'}`}>
                      {m.title}
                    </div>
                    <div className="text-[10px] mt-0 text-stone-500">
                      {m.desc}
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    active
                      ? `${colorClass.dot} shadow-sm`
                      : 'border-2 border-stone-200 bg-white'
                  }`}>
                    {active && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>
              )
            })}
          </div>
          {isSwitching && (
            <div className="px-5 pb-4 flex items-center justify-center gap-2 text-[11px] text-emerald-500 font-medium">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              결제 수단을 준비하고 있어요...
            </div>
          )}
          {/* 결제수단 전환 실패 안내 배너 (idle 상태에서 message가 있을 때만) */}
          {!isSwitching && !isPaying && message && (
            <div className="mx-3 mb-3 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3">
              <p className="text-xs font-bold text-rose-700 mb-0.5">결제 수단 전환에 실패했어요</p>
              <p className="text-[11px] text-rose-600/90 leading-relaxed">{message}</p>
              <p className="text-[10px] text-stone-500 mt-1.5">다른 결제 수단을 선택하거나 잠시 후 다시 시도해 주세요.</p>
            </div>
          )}
        </section>

        {/* 가상계좌 정보 */}
        {isVbankSelected && app?.virtual_account_number && (
          <section className="rounded-3xl border border-amber-200/60 overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' }}>
            <div className="px-5 py-3.5 border-b border-amber-200/40 flex items-center justify-between">
              <h2 className="text-sm font-bold text-amber-900">입금 계좌</h2>
              {app.virtual_account_expired_at && (
                <span className="text-[11px] text-amber-700 font-medium bg-white/60 px-2 py-1 rounded-full">
                  {new Date(app.virtual_account_expired_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} 만료
                </span>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-700">은행</span>
                <span className="text-sm font-semibold text-amber-900">{app.virtual_account_bank}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-700">계좌번호</span>
                <span className="text-base font-bold text-amber-950 tracking-wide">{app.virtual_account_number}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-700">예금주</span>
                <span className="text-sm font-semibold text-amber-900">범빌드코리아</span>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-300/30 rounded-2xl bg-white/60 px-3 py-2.5">
                <p className="text-xs text-amber-900 leading-relaxed">
                  위 계좌로 <b>{amount.toLocaleString('ko-KR')}원</b>을 입금해 주세요.<br />입금 확인 후 자동으로 예약 접수 처리됩니다.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 가상계좌 발급 실패 */}
        {isVbankSelected && !app?.virtual_account_number && !isSwitching && (
          <section className="rounded-3xl border border-rose-200 overflow-hidden shadow-sm bg-rose-50/50">
            <div className="px-5 py-4">
              <p className="text-sm font-bold text-rose-700 mb-1">가상계좌 발급에 실패했어요</p>
              <p className="text-xs text-stone-600 leading-relaxed mb-3">
                다른 결제 수단을 선택하시거나 아래 버튼으로 다시 시도해 주세요.
              </p>
              <button
                onClick={() => switchMethod('vbank')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 transition-colors"
              >
                가상계좌 재발급
              </button>
            </div>
          </section>
        )}

        {/* 고객센터 */}
        <div className="rounded-2xl bg-white/80 backdrop-blur border border-stone-200/60 px-4 py-2.5 shadow-sm">
          <p className="text-[11px] font-bold text-stone-800 mb-1">고객센터</p>
          <div className="text-[10px] text-stone-500 leading-relaxed">
            <p>평일·토요일 09:00 – 18:00 (일요일·공휴일 휴무)</p>
            <p className="mt-0.5">
              <a href="tel:1522-9597" className="text-emerald-600 font-semibold hover:underline">1522-9597</a>
              <span className="mx-1.5 text-stone-300">·</span>
              <a href="mailto:sunrise@bbkorea.co.kr" className="text-emerald-600 hover:underline">sunrise@bbkorea.co.kr</a>
            </p>
          </div>
        </div>

        {/* 사업자 정보 */}
        <div className="text-center text-[9px] text-stone-400 leading-relaxed pt-1">
          <p className="font-semibold text-stone-600 mb-0.5 text-[10px]">범빌드코리아 (BUMBUILD KOREA)</p>
          <p>대표 조동환 · 사업자등록번호 398-81-04260</p>
          <p>경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
          <p>통신판매업 신고 제 2026-성남중원-0489호 · 결제대행 포트원(주) · KG이니시스</p>
          <p className="mt-1.5">
            <a href="/terms"   className="text-stone-500 hover:text-stone-700 underline mx-1">이용약관</a>
            <a href="/privacy" className="text-stone-500 hover:text-stone-700 underline mx-1">개인정보처리방침</a>
            <a href="/refund"  className="text-stone-500 hover:text-stone-700 underline mx-1">환불규정</a>
          </p>
          <div className="mt-2 flex justify-center">
            <KbEscrowBadge theme="light" />
          </div>
        </div>
      </div>

      {/* 하단 고정 결제 버튼 - 파스텔 그라디언트 */}
      {(selectedMethod === 'card' || selectedMethod === 'transfer') && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-lg border-t border-stone-200/60 shadow-2xl">
          <div className="max-w-md mx-auto px-4 py-2.5">
            <button
              onClick={handlePay}
              disabled={isPaying || isSwitching}
              className="w-full py-3 rounded-xl font-bold text-white text-[14px] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 tracking-tight shadow-md active:scale-[0.98]"
              style={{
                background: (isPaying || isSwitching)
                  ? 'linear-gradient(135deg, #D1D5DB 0%, #9CA3AF 100%)'
                  : 'linear-gradient(135deg, #6EE7B7 0%, #34D399 50%, #2DD4BF 100%)',
                boxShadow: (isPaying || isSwitching)
                  ? 'none'
                  : '0 8px 20px -6px rgba(52, 211, 153, 0.35), 0 3px 6px -2px rgba(52, 211, 153, 0.15)',
              }}
            >
              {isPaying ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  결제 처리 중...
                </>
              ) : (
                <>
                  <LockIcon className="w-3.5 h-3.5" />
                  <span>{amount.toLocaleString('ko-KR')}원 안전결제</span>
                </>
              )}
            </button>
            <p className="text-center text-[9px] text-stone-400 mt-1">
              결제 시 <a href="/terms" className="underline hover:text-stone-600">이용약관</a>과 <a href="/privacy" className="underline hover:text-stone-600">개인정보처리방침</a>에 동의합니다
            </p>
          </div>
        </div>
      )}

      {/* 신청서 상세보기 · 개별 필드 편집 모달 */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/40 backdrop-blur-sm"
          onClick={() => saveState !== 'saving' && setDetailOpen(false)}
        >
          <div
            className="relative w-full sm:max-w-md bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-stone-900">신청서 상세</h2>
                <p className="text-[10px] text-stone-500 mt-0.5">각 필드 우측 <b>수정</b>을 눌러 개별 편집·저장</p>
              </div>
              <button
                type="button"
                onClick={() => saveState !== 'saving' && setDetailOpen(false)}
                disabled={saveState === 'saving'}
                className="w-7 h-7 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-100 disabled:opacity-40 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6"  x2="6"  y2="18" />
                  <line x1="6"  y1="6"  x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 필드 리스트 — 컴팩트 라인 */}
            <div className="overflow-y-auto flex-1 divide-y divide-stone-100">
              {EDITABLE_FIELD_LABELS.map((field) => {
                const { key, label, type, options } = field
                const isEditing = editingKey === key
                const currentValue = String(app?.[key] ?? '')
                const inputCls = 'w-full px-2.5 py-1.5 text-[13px] rounded-lg border border-stone-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-stone-900 placeholder:text-stone-300'

                if (isEditing) {
                  return (
                    <div key={key} className="px-5 py-3 bg-emerald-50/40">
                      <div className="text-[10px] font-semibold text-emerald-700 mb-1.5">{label} · 편집 중</div>
                      {type === 'textarea' ? (
                        <textarea
                          rows={2}
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className={inputCls + ' resize-none leading-relaxed'}
                          autoFocus
                        />
                      ) : type === 'select' && options ? (
                        <select
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className={inputCls}
                          autoFocus
                        >
                          <option value="">선택하세요</option>
                          {options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={type ?? 'text'}
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className={inputCls}
                          autoFocus
                        />
                      )}
                      {saveState === 'error' && saveMessage && (
                        <p className="mt-1.5 text-[10px] text-rose-600">{saveMessage}</p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saveState === 'saving'}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={saveField}
                          disabled={saveState === 'saving'}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {saveState === 'saving' ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={key} className="px-5 py-2.5 flex items-center gap-2 hover:bg-stone-50/60">
                    <div className="w-20 text-[11px] font-semibold text-stone-500 flex-shrink-0">{label}</div>
                    <div className="flex-1 text-[12px] text-stone-800 truncate" title={currentValue || '(비어 있음)'}>
                      {currentValue || <span className="text-stone-300">비어 있음</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(key)}
                      disabled={editingKey !== null}
                      className="flex-shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      수정
                    </button>
                  </div>
                )
              })}

              {/* 결제 관련 (편집 불가) */}
              <div className="px-5 py-3 bg-stone-50/50">
                <p className="text-[10px] font-semibold text-stone-500 mb-1.5">결제 관련 (편집 불가)</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-stone-500">서비스</span><span className="text-stone-800 font-medium">{app?.service_type || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">결제수단</span><span className="text-stone-800 font-medium truncate ml-1">{app?.payment_method || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">1차 결제</span><span className="text-stone-800 font-medium">{Number(app?.deposit ?? 0).toLocaleString('ko-KR')}원</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">총 금액</span><span className="text-stone-800 font-medium">{(Number(app?.supply_amount ?? 0) + Number(app?.vat ?? 0)).toLocaleString('ko-KR')}원</span></div>
                </div>
              </div>
            </div>

            {/* 하단 닫기 */}
            <div className="px-5 py-2.5 border-t border-stone-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                disabled={saveState === 'saving'}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
