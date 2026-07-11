import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// Pretendard 폰트 등록 (WorkerPDF와 동일 패턴)
const origin = typeof window !== 'undefined' ? window.location.origin : ''
Font.register({
  family: 'Pretendard',
  fonts: [
    { src: `${origin}/fonts/Pretendard-Regular.ttf`, fontWeight: 400 },
    { src: `${origin}/fonts/Pretendard-Bold.ttf`,    fontWeight: 700 },
  ],
})

const ACCENT   = '#1a3a5c'
const BORDER   = '#bbb'
const LABEL_BG = '#f0f2f5'
const NET_BG   = '#eef4ff'

export interface PayslipJob {
  date: string
  businessName: string
  serviceType: string | null
  amount: number
}

export interface PayslipData {
  month: string
  payDate: string | null
  person: {
    type: 'user' | 'worker'
    id: string
    employeeNumber: string
    name: string
    birthDate: string | null
    residentNumberMasked: string
    department: string | null
    position: string | null
    joinDate: string | null
    employmentType: string | null
    taxType: '4대보험' | '프리랜서3.3%' | '없음'
    salaryBasis: '세전' | '세후'
    accountNumber: string | null
    phone: string | null
    email: string | null
    homeAddress: string | null
  }
  workSummary: {
    workDays: number
    jobCount: number
    periodStart: string
    periodEnd: string
  }
  jobs: PayslipJob[]
  gross: {
    autoAmount: number
    bookedAmount: number
    finalAmount: number
    isAdjusted: boolean
    isNetBasis: boolean
    note: string | null
    isPaid: boolean
  }
  deductions: {
    nationalPension: number
    healthInsurance: number
    longtermCare: number
    employmentInsurance: number
    incomeTax: number
    residentTax: number
    businessTax: number
    total: number
  }
  netPay: number
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Pretendard',
    padding: '18mm 15mm 12mm 15mm',
    fontSize: 9,
    color: '#111',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: `2pt solid ${ACCENT}`,
    paddingBottom: 7,
    marginBottom: 10,
  },
  companyName: { fontSize: 9, fontWeight: 700, color: ACCENT, marginBottom: 3 },
  docTitle:    { fontSize: 18, fontWeight: 700, color: ACCENT },
  headerRight: { alignItems: 'flex-end' },
  headerText:  { fontSize: 8, color: '#666', marginBottom: 1 },

  table: { border: `0.5pt solid ${BORDER}`, marginBottom: 7, overflow: 'hidden' },
  sectionBar: { backgroundColor: ACCENT, paddingHorizontal: 7, paddingVertical: 3.5 },
  sectionBarText: { color: '#fff', fontWeight: 700, fontSize: 8.5 },

  row:        { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  labelCell:  {
    backgroundColor: LABEL_BG, width: 65, paddingHorizontal: 6, paddingVertical: 5,
    justifyContent: 'center', borderRight: `0.5pt solid ${BORDER}`,
    fontWeight: 700, fontSize: 8, color: '#333',
  },
  valueCell:  { flex: 1, paddingHorizontal: 7, paddingVertical: 5, justifyContent: 'center', fontSize: 8.5 },

  amountTable: { border: `0.5pt solid ${BORDER}`, marginBottom: 7, overflow: 'hidden' },
  amountHeaderRow: { flexDirection: 'row', backgroundColor: LABEL_BG, borderBottom: `0.5pt solid ${BORDER}` },
  amountHeaderCell: { paddingHorizontal: 7, paddingVertical: 4, fontWeight: 700, fontSize: 8, color: '#333', borderRight: `0.5pt solid ${BORDER}` },
  amountRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  amountLabelCell: { flex: 2, paddingHorizontal: 7, paddingVertical: 5, borderRight: `0.5pt solid ${BORDER}`, fontSize: 8.5 },
  amountValueCell: { flex: 1, paddingHorizontal: 7, paddingVertical: 5, textAlign: 'right', fontSize: 8.5 },
  amountTotalRow: { flexDirection: 'row', backgroundColor: LABEL_BG },
  amountTotalLabel: { flex: 2, paddingHorizontal: 7, paddingVertical: 5, borderRight: `0.5pt solid ${BORDER}`, fontWeight: 700, fontSize: 8.5 },
  amountTotalValue: { flex: 1, paddingHorizontal: 7, paddingVertical: 5, textAlign: 'right', fontWeight: 700, fontSize: 8.5 },

  netBox: {
    backgroundColor: NET_BG, border: `1pt solid ${ACCENT}`, borderRadius: 3,
    padding: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  netLabel: { fontSize: 10, fontWeight: 700, color: ACCENT },
  netValue: { fontSize: 16, fontWeight: 700, color: ACCENT },

  historyHeaderRow: { flexDirection: 'row', backgroundColor: LABEL_BG, borderBottom: `0.5pt solid ${BORDER}` },
  historyHeaderCell: { paddingHorizontal: 6, paddingVertical: 4, fontWeight: 700, fontSize: 7.5, color: '#333', borderRight: `0.5pt solid ${BORDER}` },
  historyRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  historyCell: { paddingHorizontal: 6, paddingVertical: 4, fontSize: 7.8, borderRight: `0.5pt solid ${BORDER}` },

  footer: { marginTop: 8, paddingTop: 6, borderTop: `1pt solid ${ACCENT}`, textAlign: 'center' },
  footerText: { fontSize: 7.5, color: '#666', marginBottom: 2 },
  companyStamp: { fontSize: 10, fontWeight: 700, color: ACCENT, marginTop: 4 },
})

// 값이 없으면 하이픈으로 표시
function v(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '-'
  return String(val)
}

// 통화 포맷
function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

function Row1({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <View style={s.labelCell}><Text>{label}</Text></View>
      <View style={s.valueCell}><Text>{value}</Text></View>
    </View>
  )
}

function Row2({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) {
  return (
    <View style={s.row}>
      <View style={s.labelCell}><Text>{l1}</Text></View>
      <View style={[s.valueCell, { borderRight: `0.5pt solid ${BORDER}` }]}><Text>{v1}</Text></View>
      <View style={s.labelCell}><Text>{l2}</Text></View>
      <View style={s.valueCell}><Text>{v2}</Text></View>
    </View>
  )
}

// 지급/공제 라인 아이템
function AmountLine({ label, value, hint }: { label: string; value: number; hint?: string }) {
  if (value === 0) return null
  return (
    <View style={s.amountRow}>
      <View style={s.amountLabelCell}>
        <Text>
          {label}
          {hint && <Text style={{ color: '#888', fontSize: 7.5 }}>  {hint}</Text>}
        </Text>
      </View>
      <View style={s.amountValueCell}><Text>{won(value)}</Text></View>
    </View>
  )
}

export function PayslipPDFDocument({ data }: { data: PayslipData }) {
  const [y, m] = data.month.split('-')
  const monthLabel = `${y}년 ${Number(m)}월`
  const issueDate = new Date().toLocaleDateString('ko-KR')

  const p = data.person
  const workPeriod = `${data.workSummary.periodStart} ~ ${data.workSummary.periodEnd}`

  // 근무 상세를 일자별로 정렬
  const sortedJobs = [...data.jobs].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── 헤더 ── */}
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>범빌드코리아  BEOMBUILD KOREA</Text>
            <Text style={s.docTitle}>급여명세서 · {monthLabel}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerText}>발행일: {issueDate}</Text>
            {data.payDate && <Text style={s.headerText}>지급일: {data.payDate}</Text>}
            <Text style={s.headerText}>급여유형: {p.taxType} · {p.salaryBasis}</Text>
          </View>
        </View>

        {/* ── 근로자 정보 ── */}
        <View style={s.table}>
          <View style={s.sectionBar}><Text style={s.sectionBarText}>근로자 정보</Text></View>
          <Row2 l1="성      명" v1={v(p.name)} l2="사      번" v2={v(p.employeeNumber)} />
          <Row2 l1="주 민 번 호" v1={v(p.residentNumberMasked)} l2="고 용 형 태" v2={v(p.employmentType)} />
          <Row2 l1="부      서" v1={v(p.department)} l2="직      급" v2={v(p.position)} />
          <Row2 l1="입  사  일" v1={v(p.joinDate)} l2="지 급 계 좌" v2={v(p.accountNumber)} />
        </View>

        {/* ── 근무 정보 ── */}
        <View style={s.table}>
          <View style={s.sectionBar}><Text style={s.sectionBarText}>근무 정보</Text></View>
          <Row2 l1="근 무 기 간" v1={workPeriod} l2="근 무 일 수" v2={`${data.workSummary.workDays}일`} />
          <Row1 label="근 무 건 수" value={`${data.workSummary.jobCount}건`} />
        </View>

        {/* ── 지급 내역 ── */}
        <View style={s.amountTable}>
          <View style={s.sectionBar}><Text style={s.sectionBarText}>지급 내역</Text></View>
          <View style={s.amountHeaderRow}>
            <Text style={[s.amountHeaderCell, { flex: 2 }]}>항목</Text>
            <Text style={[s.amountHeaderCell, { flex: 1, textAlign: 'right', borderRight: undefined }]}>금액</Text>
          </View>
          <AmountLine label="기 본 급" value={data.gross.finalAmount} />
          {data.gross.isNetBasis && (
            <View style={s.amountRow}>
              <View style={s.amountLabelCell}>
                <Text style={{ color: '#888', fontSize: 7.5 }}>
                  (책정된 실지급 {won(data.gross.bookedAmount)} 기준 총 지급액 역산)
                </Text>
              </View>
              <View style={s.amountValueCell}><Text> </Text></View>
            </View>
          )}
          {data.gross.isAdjusted && !data.gross.isNetBasis && (
            <View style={s.amountRow}>
              <View style={s.amountLabelCell}>
                <Text style={{ color: '#888', fontSize: 7.5 }}>
                  (자동 계산: {won(data.gross.autoAmount)} → 관리자 조정)
                </Text>
              </View>
              <View style={s.amountValueCell}><Text> </Text></View>
            </View>
          )}
          <View style={s.amountTotalRow}>
            <Text style={s.amountTotalLabel}>지급 총액</Text>
            <Text style={s.amountTotalValue}>{won(data.gross.finalAmount)}</Text>
          </View>
        </View>

        {/* ── 공제 내역 (없으면 안내 문구) ── */}
        {data.deductions.total > 0 ? (
          <View style={s.amountTable}>
            <View style={s.sectionBar}><Text style={s.sectionBarText}>공제 내역 · {p.taxType}</Text></View>
            <View style={s.amountHeaderRow}>
              <Text style={[s.amountHeaderCell, { flex: 2 }]}>항목</Text>
              <Text style={[s.amountHeaderCell, { flex: 1, textAlign: 'right', borderRight: undefined }]}>금액</Text>
            </View>
            <AmountLine label="국 민 연 금" value={data.deductions.nationalPension} hint="4.5%" />
            <AmountLine label="건 강 보 험" value={data.deductions.healthInsurance} hint="3.545%" />
            <AmountLine label="장기요양보험" value={data.deductions.longtermCare} hint="건강보험료의 12.95%" />
            <AmountLine label="고 용 보 험" value={data.deductions.employmentInsurance} hint="0.9%" />
            <AmountLine label="사 업 소 득 세" value={data.deductions.businessTax} hint="3%" />
            <AmountLine label="소  득  세" value={data.deductions.incomeTax} />
            <AmountLine label="지방소득세" value={data.deductions.residentTax} />
            <View style={s.amountTotalRow}>
              <Text style={s.amountTotalLabel}>공제 총액</Text>
              <Text style={s.amountTotalValue}>{won(data.deductions.total)}</Text>
            </View>
          </View>
        ) : (
          <View style={[s.table, { padding: 8, backgroundColor: '#fafafa' }]}>
            <Text style={{ fontSize: 8, color: '#666' }}>
              ※ 공제 없음 (급여유형: {p.taxType})
            </Text>
          </View>
        )}

        {/* ── 실지급액 (강조) ── */}
        <View style={s.netBox}>
          <Text style={s.netLabel}>실 지 급 액</Text>
          <Text style={s.netValue}>{won(data.netPay)}</Text>
        </View>

        {/* ── 근무 상세 (선택적, 있을 때만) ── */}
        {sortedJobs.length > 0 && (
          <View style={s.table}>
            <View style={s.sectionBar}><Text style={s.sectionBarText}>근무 상세</Text></View>
            <View style={s.historyHeaderRow}>
              <Text style={[s.historyHeaderCell, { width: 55 }]}>일자</Text>
              <Text style={[s.historyHeaderCell, { flex: 1 }]}>업체명</Text>
              {p.type === 'user' && <Text style={[s.historyHeaderCell, { width: 60 }]}>서비스</Text>}
              <Text style={[s.historyHeaderCell, { width: 65, textAlign: 'right', borderRight: undefined }]}>금액</Text>
            </View>
            {sortedJobs.map((j, i) => (
              <View key={i} style={s.historyRow}>
                <Text style={[s.historyCell, { width: 55 }]}>{j.date.slice(5).replace('-', '/')}</Text>
                <Text style={[s.historyCell, { flex: 1 }]}>{j.businessName}</Text>
                {p.type === 'user' && <Text style={[s.historyCell, { width: 60 }]}>{j.serviceType ?? '-'}</Text>}
                <Text style={[s.historyCell, { width: 65, textAlign: 'right', borderRight: undefined }]}>
                  {j.amount > 0 ? j.amount.toLocaleString('ko-KR') : '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 관리자 메모 ── */}
        {data.gross.note && (
          <View style={s.table}>
            <View style={s.sectionBar}><Text style={s.sectionBarText}>관리자 메모</Text></View>
            <View style={{ padding: 7 }}>
              <Text style={{ fontSize: 8.5 }}>{data.gross.note}</Text>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            본 급여명세서는 근로기준법 제48조에 따라 발급되었으며, 위 내용을 확인하고 이의가 있는 경우 발급일로부터 3일 이내에 인사담당자에게 문의 바랍니다.
          </Text>
          <Text style={s.companyStamp}>범빌드코리아 (인)</Text>
        </View>

      </Page>
    </Document>
  )
}
