'use client'

/**
 * 지표(metrics_config) 설정 페이지
 * PLAN v2 §3.6
 *
 * 17개 시드 목록 · alive/show_on_dashboard 토글 + target_value 편집
 * 라이브 변경 (PATCH) — 저장 버튼 없이 즉시 반영
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Gauge } from 'lucide-react'

interface Metric {
  key: string
  function_code: string
  label: string
  unit: string
  target_value: number | null
  direction: string
  cycle: string
  show_on_dashboard: boolean
  alive: boolean
  calculation: string
  sort_order: number
}

// 각 지표의 뜻 (한 줄 설명)
const METRIC_DESCRIPTIONS: Record<string, string> = {
  jobs_backlog: '계약은 완료했지만 아직 시공하지 않은 일감 재고',
  new_inquiries: '이달 새로 들어온 상담 문의 수 (영업 유입 규모)',
  daily_check_rate: '오늘 완료된 작업 중 대표가 확인·반응한 비율 (규정 제6조)',
  ontime_rate: '약속한 시공일에 딱 맞춰 완료한 비율',
  claims_count: '이달 고객 불만·항의 건수 (낮을수록 좋음)',
  rework_count: '이달 재청소하러 다시 방문한 건수 (낮을수록 좋음)',
  churn_count: '이달 정기 계약을 해지한 고객 수 (낮을수록 좋음)',
  renewal_rate: '계약 만료 고객 중 다시 연장한 비율',
  cash_balance: '지금 회사 통장에 있는 현금 잔액 (매주 스냅샷)',
  receivables_90: '90일 넘게 못 받은 미수금 총액 (낮을수록 좋음)',
  next30_outflow: '앞으로 30일 안에 나가야 할 지출 예정액',
  bep_progress: '이달 손익분기점(BEP)에 몇 % 도달했는지',
  contract_coverage: '전체 작업자 중 근로계약서가 있는 비율',
  safe_days: '마지막 안전사고 이후 며칠째 (높을수록 좋음)',
  days_since_training: '마지막 안전교육 이후 며칠 지났는지 (낮을수록 좋음)',
  notice_rate: '매주 금요일 3줄 공지 발행 이행률 (규정 제7조)',
  meeting_rate: '매달 월간 회의 개최 이행률',
  revenue_onetime_rate: '이달 1회성케어 매출 금액 (목표는 원 단위 입력, 달성률은 대시보드에서 자동 %)',
  revenue_deep_rate: '이달 정기딥케어 매출 금액 (월간+연간 통합, 목표는 원 단위 입력)',
  revenue_end_rate: '이달 정기엔드케어 매출 금액 (목표는 원 단위 입력)',
  attendance_rate: '이달 배정된 근무 중 실제 출근한 비율 (배정 대비 출근율)',
  ontime_work_rate: '이달 배정 시공 시간의 ±30분 이내 출근한 비율 (정시 출근율)',
  equipment_care_rate: '이번 주 전체 작업자 중 정기관리 사진을 제출한 비율',
}

// 각 지표별 상세 측정 방법 매뉴얼
interface MetricManual {
  source: string
  logic: string
  inputLocation?: string
  inputLink?: string
  notes?: string
}

const METRIC_MANUALS: Record<string, MetricManual> = {
  // ── 자동 지표 (auto) ─────────────────────────────────────
  new_inquiries: {
    source: 'service_applications 테이블 (온라인 신청서)',
    logic: '이달 신규 접수된 신청서 건수 (created_at 기준)',
    notes: '유입 채널은 신청서 URL의 ?source= 파라미터로 자동 감지됩니다. 예: /apply?source=soomgo → 숨고 유입',
  },
  daily_check_rate: {
    source: 'service_applications 테이블',
    logic: '오늘 시공완료(work_completed_at)된 작업 중 관리자가 반응(admin_reacted_by)한 비율',
    notes: '규정 제6조: 대표는 오늘 완료된 작업에 반드시 확인 반응을 남겨야 함',
  },
  claims_count: {
    source: 'claims 테이블',
    logic: '이달 occurred_at(발생일)이 있는 클레임 카운트',
    inputLocation: '/admin/claims',
    inputLink: '/admin/claims',
    notes: '재청소하러 갔으면 is_rework 체크 필요 (별도 재작업 지표에도 반영됨)',
  },
  revenue_onetime_rate: {
    source: 'service_applications 테이블',
    logic: '이달 시공완료된 1회성케어 건의 (공급가액 + 부가세) 합계를 원 단위로 계산',
    notes: '/admin/finance/details 페이지의 1회성케어 매출과 동일 기준. 목표(원)를 위 입력창에 넣으면 대시보드에서 실적 원 + 달성률(%)이 함께 표시됨.',
  },
  revenue_deep_rate: {
    source: 'service_billings + customers 테이블',
    logic: '이달 결제완료(paid_date)된 정기딥케어 청구 금액 합계를 원 단위로 계산. 월간+연간 통합.',
    notes: '결제완료 시점 기준이라 시공 시점과 다를 수 있음. finance/details 페이지와 동일 기준. 목표는 월간 매출 원 단위.',
  },
  revenue_end_rate: {
    source: 'service_billings + customers 테이블',
    logic: '이달 결제완료(paid_date)된 정기엔드케어 청구 금액 합계를 원 단위로 계산',
    notes: '결제완료 시점 기준. finance/details 페이지와 동일 기준. 목표는 월간 매출 원 단위.',
  },
  attendance_rate: {
    source: 'work_assignments + attendance 테이블',
    logic: '이달 배정된 work_assignments 건수 중 해당 (worker_id, construction_date)에 clock_in 이 있는 비율',
    inputLocation: '/admin/attendance',
    inputLink: '/admin/attendance',
    notes: '배정 없는 날은 분모에서 제외 (근무 예정일만 대상). 대시보드에 직원별 출근 일수도 함께 표시됨.',
  },
  ontime_work_rate: {
    source: 'work_assignments + service_applications + attendance',
    logic: '이달 배정 중 service_applications.construction_time 이 있는 건에 한해, clock_in 이 예정시각 ±30분 이내면 정시로 판정',
    inputLocation: '/admin/attendance',
    inputLink: '/admin/attendance',
    notes: '시공 시간(construction_time)이 등록되지 않은 배정은 판정 대상에서 제외됩니다. 신청서에 시공 시간을 꼭 입력하세요.',
  },
  equipment_care_rate: {
    source: 'equipment_care_records + users(role=worker) 테이블',
    logic: '활성 작업자 수 대비 이번 주 월요일 기준 사진 제출한 건수 비율',
    inputLocation: '/admin/regular-care',
    inputLink: '/admin/regular-care',
    notes: '워커는 /worker/regular-care 에서 사진 제출. 관리자는 승인/재정리 요청 가능. 매주 리셋됨(주 단위 지표).',
  },
  // ── 수기입력 지표 (manual) ───────────────────────────────
  jobs_backlog: {
    source: '월간 회의 폼 수기입력',
    logic: '대표님이 매달 회의 때 "지금 계약은 됐는데 아직 시공 안 한 건수"를 직접 입력',
    inputLocation: '월간 회의 (/admin/ops/meetings)',
    inputLink: '/admin/ops/meetings',
  },
  ontime_rate: {
    source: '월간 회의 폼 수기입력',
    logic: '이달 완료된 시공 중 약속 날짜에 정확히 완료한 비율을 대표님이 판단해 입력',
    inputLocation: '월간 회의',
    inputLink: '/admin/ops/meetings',
  },
  rework_count: {
    source: 'claims 테이블',
    logic: '이달 발생한 클레임 중 is_rework=true 카운트',
    inputLocation: '/admin/claims',
    inputLink: '/admin/claims',
    notes: '재청소 갔을 때 반드시 클레임 등록 + 재작업 체크',
  },
  churn_count: {
    source: '월간 회의 폼 수기입력',
    logic: '이달 정기 계약을 해지한 고객 수를 대표님이 직접 입력',
    inputLocation: '월간 회의',
    inputLink: '/admin/ops/meetings',
  },
  renewal_rate: {
    source: '월간 회의 폼 수기입력 (분기별)',
    logic: '분기 내 계약 만료 고객 중 재계약한 비율',
    inputLocation: '월간 회의',
    inputLink: '/admin/ops/meetings',
  },
  cash_balance: {
    source: 'cash_snapshots 테이블 (매주 수기)',
    logic: '대표님이 매주 한 번 통장 잔액을 수기 입력',
    inputLocation: '현금 스냅샷',
    inputLink: '/admin/ops/cash',
  },
  receivables_90: {
    source: 'cash_snapshots 테이블 (매주 수기)',
    logic: '90일 이상 지난 미수금을 대표님이 수기 입력',
    inputLocation: '현금 스냅샷',
    inputLink: '/admin/ops/cash',
  },
  next30_outflow: {
    source: 'cash_snapshots 테이블 (매주 수기)',
    logic: '앞으로 30일 안에 나갈 지출 예정액을 대표님이 수기 입력',
    inputLocation: '현금 스냅샷',
    inputLink: '/admin/ops/cash',
  },
  bep_progress: {
    source: '미구현 (BEP 자동 계산 시스템 없음)',
    logic: '손익 자동 집계 시스템이 구축되면 활성화 예정',
  },
  contract_coverage: {
    source: '미구현 (workers 테이블 계약서 필드 필요)',
    logic: '근로계약서 관리 시스템이 구축되면 활성화 예정',
  },
  safe_days: {
    source: 'company_intent.safe_days_start_date',
    logic: '무사고 시작일부터 오늘까지 일수 자동 계산',
  },
  days_since_training: {
    source: '미구현 (안전교육 이력 시스템 필요)',
    logic: '교육 이력 시스템 구축 후 활성화 예정',
  },
  notice_rate: {
    source: 'weekly_notices 테이블',
    logic: '이번 주 발행분 존재 여부 (있으면 100%, 없으면 0%)',
    inputLocation: '주간 공지',
    inputLink: '/admin/ops/notices',
  },
  meeting_rate: {
    source: 'monthly_meetings 테이블',
    logic: '이달 회의 held_at 존재 여부',
    inputLocation: '월간 회의',
    inputLink: '/admin/ops/meetings',
  },
}

// 기능 코드 → 한글 이름 매핑
const FUNCTION_LABELS: Record<string, string> = {
  IN1: '영업·수주',
  IN2: '현장·납품',
  IN3: '품질·고객관리',
  IN4: '재무·자금',
  IN5: '인사·노무',
  IN6: '안전·법규',
  IN7: '기획·전략',
}

// 주기 코드 → 한글 이름
const CYCLE_LABELS: Record<string, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매달',
  quarterly: '분기',
}

// 계산 방식 → 한글 이름
const CALC_LABELS: Record<string, string> = {
  auto: '자동',
  manual: '수기입력',
}

export default function MetricsSettingsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/ops/settings/metrics')
      .then(r => r.json())
      .then(j => { if (j.ok) setMetrics(j.metrics) })
      .catch(() => toast.error('로드 실패'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const patchOne = async (key: string, body: Partial<Metric>) => {
    try {
      const res = await fetch('/api/admin/ops/settings/metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...body }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? '실패')
      setMetrics(prev => prev.map(m => m.key === key ? { ...m, ...body } : m))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><Gauge size={20} /> 지표 설정</h1>
      </div>

      {/* 사용법 안내 박스 */}
      <div className="bg-surface-sunken border border-border-subtle rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary mb-1">📊 이 페이지는 뭐 하는 곳인가요?</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            회사가 지금 잘 굴러가는지 한눈에 보는 <b>계기판(대시보드)</b>에 어떤 숫자를 띄울지 고르는 곳입니다.
            아래 17개 지표 중 원하는 것만 켜서 관리자 홈(/admin)과 월간 보고서에 노출할 수 있습니다.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-bold text-text-primary mb-1">🎛️ 3가지 조작</h3>
          <ul className="text-xs text-text-secondary leading-relaxed space-y-0.5 pl-1">
            <li>· <b>활성</b> : 이 지표를 시스템이 살아있는 것으로 취급. 끄면 완전히 죽은 지표가 됩니다 (3개월 검증 실패 시 사용).</li>
            <li>· <b>대시보드</b> : 관리자 홈 화면에 실제로 띄울지 여부. (활성이지만 화면엔 숨기고 싶을 때 유용)</li>
            <li>· <b>목표</b> : 이달 성과 판정 기준값. 넘으면 초록, 못 넘으면 빨강으로 표시됩니다.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-bold text-text-primary mb-1">🏷️ 각 지표 아래 회색 태그 뜻</h3>
          <p className="text-xs text-text-secondary leading-relaxed mb-1">
            예) <span className="font-mono bg-white px-1 rounded">IN1 · monthly · manual</span> → <b>영업·수주 기능 / 매달 측정 / 수기입력</b>
          </p>
          <ul className="text-xs text-text-secondary leading-relaxed space-y-0.5 pl-1">
            <li>· <b>기능 코드</b> : IN1 영업·수주 / IN2 현장·납품 / IN3 품질·고객관리 / IN4 재무·자금 / IN5 인사·노무 / IN6 안전·법규 / IN7 기획·전략</li>
            <li>· <b>측정 주기</b> : daily 매일 / weekly 매주 / monthly 매달 / quarterly 분기</li>
            <li>· <b>계산 방식</b> : <b>auto</b>는 시스템이 자동 계산 (손 안 대셔도 됨), <b>manual</b>은 월간 회의나 현금 스냅샷에서 수기입력 필요</li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-bold text-text-primary mb-1">🔄 사용 흐름</h3>
          <ol className="text-xs text-text-secondary leading-relaxed space-y-0.5 pl-1 list-decimal list-inside">
            <li>여기서 <b>대시보드</b> 체크 + 목표값 입력</li>
            <li>auto 지표는 시스템이 알아서 수집</li>
            <li>manual 지표는 월간 회의(<span className="font-mono">/admin/ops/meetings</span>)나 현금 스냅샷(<span className="font-mono">/admin/ops/cash</span>)에서 입력</li>
            <li>관리자 홈(<span className="font-mono">/admin</span>)에서 매일 확인, 목표 미달은 빨간색으로 알림</li>
          </ol>
        </div>

        <p className="text-xs text-text-tertiary bg-white rounded-lg p-2 border border-border-subtle">
          💡 <b>3개월 검증 원칙</b> : 처음엔 17개 다 켜두고 3개월 써본 뒤, 실제 의사결정에 도움 안 된 지표는 <b>활성</b>을 꺼서 완전히 제거하세요. 죽은 계기판 숫자를 3년 동안 남겨두지 않는 게 이 페이지의 핵심 목적입니다.
        </p>
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
        {metrics.map(m => (
          // Phase 27-BE: 모바일에서 라벨은 첫 줄 단독, 컨트롤 3종(활성·대시보드·목표)은
          //   다음 줄로 자연 wrap. 데스크톱(sm+)은 기존 한 줄 배치 유지.
          <div key={m.key} className="p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 w-full sm:w-auto sm:flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{m.label}</p>
              <p className="text-xs text-text-tertiary">
                {m.function_code} {FUNCTION_LABELS[m.function_code] ?? ''} · {CYCLE_LABELS[m.cycle] ?? m.cycle} · {CALC_LABELS[m.calculation] ?? m.calculation}
              </p>
              {METRIC_DESCRIPTIONS[m.key] && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed break-keep">
                  {METRIC_DESCRIPTIONS[m.key]}
                </p>
              )}
              {METRIC_MANUALS[m.key] && (
                <details className="mt-2 group">
                  <summary className="text-xs text-brand-600 cursor-pointer hover:underline select-none list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    측정 방법 자세히 보기
                  </summary>
                  <div className="mt-2 p-3 bg-surface-sunken rounded-lg text-xs text-text-secondary space-y-1.5 leading-relaxed">
                    <p><b className="text-text-primary">📍 데이터 소스</b> : {METRIC_MANUALS[m.key].source}</p>
                    <p><b className="text-text-primary">🧮 계산 로직</b> : {METRIC_MANUALS[m.key].logic}</p>
                    {METRIC_MANUALS[m.key].inputLocation && (
                      <p>
                        <b className="text-text-primary">✍️ 입력 위치</b> :{' '}
                        {METRIC_MANUALS[m.key].inputLink ? (
                          <Link href={METRIC_MANUALS[m.key].inputLink!} className="text-brand-600 hover:underline">
                            {METRIC_MANUALS[m.key].inputLocation} →
                          </Link>
                        ) : (
                          METRIC_MANUALS[m.key].inputLocation
                        )}
                      </p>
                    )}
                    {METRIC_MANUALS[m.key].notes && (
                      <p className="text-text-tertiary italic">💡 {METRIC_MANUALS[m.key].notes}</p>
                    )}
                  </div>
                </details>
              )}
            </div>

            <label className="flex items-center gap-1 text-xs text-text-secondary">
              <input type="checkbox" checked={m.alive} onChange={e => patchOne(m.key, { alive: e.target.checked })} />
              활성
            </label>
            <label className="flex items-center gap-1 text-xs text-text-secondary">
              <input type="checkbox" checked={m.show_on_dashboard} onChange={e => patchOne(m.key, { show_on_dashboard: e.target.checked })} />
              대시보드
            </label>

            <div className="flex items-center gap-1">
              <span className="text-xs text-text-tertiary">목표</span>
              <input
                type="number"
                step="any"
                defaultValue={m.target_value ?? ''}
                onBlur={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== m.target_value) patchOne(m.key, { target_value: v })
                }}
                className="w-20 px-2 py-1 rounded border border-border bg-surface text-sm text-right"
              />
              <span className="text-xs text-text-secondary w-8">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
