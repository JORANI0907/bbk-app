import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import type { Worker } from './constants'

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

export interface PDFSections {
  personal:  boolean
  job:       boolean
  salary:    boolean
  emergency: boolean
  history:   boolean
}

export interface WorkHistoryEntry {
  period:      string
  company:     string
  description: string
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Pretendard',
    padding: '18mm 15mm 12mm 15mm',
    fontSize: 8.5,
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
  docTitle:    { fontSize: 17, fontWeight: 700, color: ACCENT },
  issueDate:   { fontSize: 7.5, color: '#666' },
  // 테이블: overflow hidden으로 마지막 행 이중보더 제거
  table: {
    border: `0.5pt solid ${BORDER}`,
    marginBottom: 7,
    overflow: 'hidden',
  },
  sectionBar: {
    backgroundColor: ACCENT,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
  },
  sectionBarText: { color: '#fff', fontWeight: 700, fontSize: 8 },
  row: { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  labelCell: {
    backgroundColor: LABEL_BG,
    width: 58,
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: 'center',
    borderRight: `0.5pt solid ${BORDER}`,
    fontWeight: 700,
    fontSize: 7.8,
    color: '#333',
  },
  valueCell: {
    flex: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    justifyContent: 'center',
    fontSize: 8.5,
  },
  topBlock: {
    flexDirection: 'row',
    border: `0.5pt solid ${BORDER}`,
    marginBottom: 7,
    overflow: 'hidden',
  },
  infoCol: { flex: 1, borderRight: `0.5pt solid ${BORDER}` },
  photoCol: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  photoImg:       { width: 68, height: 88, objectFit: 'cover' },
  photoEmpty: {
    width: 68,
    height: 88,
    border: `0.5pt solid ${BORDER}`,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyText: { fontSize: 7, color: '#aaa' },
  // 업무이력
  historyHeaderRow: {
    flexDirection: 'row',
    backgroundColor: LABEL_BG,
    borderBottom: `0.5pt solid ${BORDER}`,
  },
  historyHeaderCell: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontWeight: 700,
    fontSize: 7.8,
    color: '#333',
    borderRight: `0.5pt solid ${BORDER}`,
  },
  historyRow:  { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  historyCell: { paddingHorizontal: 6, paddingVertical: 5, fontSize: 8.2, borderRight: `0.5pt solid ${BORDER}` },
})

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────────

function SectionBar({ title }: { title: string }) {
  return (
    <View style={s.sectionBar}>
      <Text style={s.sectionBarText}>{title}</Text>
    </View>
  )
}

// 값이 없으면 행 자체를 렌더링하지 않음
function Row1({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={s.row}>
      <View style={s.labelCell}><Text>{label}</Text></View>
      <View style={s.valueCell}><Text>{value}</Text></View>
    </View>
  )
}

// 두 값이 모두 없으면 숨김. 한쪽만 없으면 '-' 표시
function Row2({ l1, v1, l2, v2 }: {
  l1: string; v1?: string | null
  l2: string; v2?: string | null
}) {
  if (!v1 && !v2) return null
  return (
    <View style={s.row}>
      <View style={s.labelCell}><Text>{l1}</Text></View>
      <View style={[s.valueCell, { borderRight: `0.5pt solid ${BORDER}` }]}>
        <Text>{v1 || '-'}</Text>
      </View>
      <View style={s.labelCell}><Text>{l2}</Text></View>
      <View style={s.valueCell}><Text>{v2 || '-'}</Text></View>
    </View>
  )
}

// ─── 본문 ────────────────────────────────────────────────────────

export function WorkerPDFDocument({
  worker,
  sections,
}: {
  worker: Worker
  sections: PDFSections
}) {
  const today = new Date().toLocaleDateString('ko-KR')
  const isPartTime = worker.employment_type !== '정직원'

  const wage = isPartTime
    ? [
        worker.day_wage   ? `주간 ${worker.day_wage.toLocaleString()}원`  : null,
        worker.night_wage ? `야간 ${worker.night_wage.toLocaleString()}원` : null,
      ].filter(Boolean).join('  /  ') || null
    : worker.avg_salary ? `${worker.avg_salary.toLocaleString()}원` : null

  const history: WorkHistoryEntry[] = (() => {
    try { return JSON.parse(worker.work_history ?? '[]') as WorkHistoryEntry[] }
    catch { return [] }
  })()

  // 섹션별 표시할 데이터 존재 여부 사전 계산
  const hasPersonal = true // 이름은 항상 있음
  const hasJob = isPartTime
    ? !!(worker.skill_level || worker.specialties)
    : !!(worker.department || worker.position || worker.job_title || worker.join_date || worker.specialties)
  const hasSalary = !!(worker.account_number || wage)
  const hasEmergency = !!worker.emergency_contact
  const hasHistory = history.length > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── 헤더 ── */}
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>범빌드코리아  BEOMBUILD KOREA</Text>
            <Text style={s.docTitle}>직원 인사카드</Text>
          </View>
          <Text style={s.issueDate}>발급일: {today}</Text>
        </View>

        {/* ── 인적사항 + 사진 ── */}
        {sections.personal && hasPersonal && (
          <View style={s.topBlock}>
            <View style={s.infoCol}>
              <SectionBar title="인적사항" />
              {/* 성명은 항상 표시 */}
              <View style={s.row}>
                <View style={s.labelCell}><Text>성    명</Text></View>
                <View style={[s.valueCell, { fontWeight: 700, flex: 1.5, borderRight: `0.5pt solid ${BORDER}` }]}>
                  <Text>{worker.name}</Text>
                </View>
                <View style={s.labelCell}><Text>고용형태</Text></View>
                <View style={s.valueCell}><Text>{worker.employment_type || '-'}</Text></View>
              </View>
              <Row2 l1="생년월일" v1={worker.birth_date} l2="혈  액  형" v2={worker.blood_type ? `${worker.blood_type}형` : null} />
              <Row2 l1="성    별"  v1={worker.gender}     l2="연  락  처" v2={worker.phone} />
              <Row1 label="이  메  일" value={worker.email} />
              <Row1 label="주    소"   value={worker.home_address} />
            </View>
            <View style={s.photoCol}>
              {worker.photo_url
                ? <Image src={worker.photo_url} style={s.photoImg} />
                : <View style={s.photoEmpty}><Text style={s.photoEmptyText}>사진</Text></View>
              }
            </View>
          </View>
        )}

        {/* ── 직무 정보 ── */}
        {sections.job && hasJob && (
          <View style={s.table}>
            <SectionBar title="직무 정보" />
            {!isPartTime ? (
              <>
                <Row2 l1="부    서"  v1={worker.department} l2="직    급"   v2={worker.position} />
                <Row2 l1="직    책"  v1={worker.job_title}  l2="입  사  일" v2={worker.join_date || undefined} />
              </>
            ) : (
              <Row2 l1="숙  련  도" v1={worker.skill_level} l2="고용형태" v2={worker.employment_type} />
            )}
            <Row1 label="특화작업" value={worker.specialties} />
          </View>
        )}

        {/* ── 급여 정보 ── */}
        {sections.salary && hasSalary && (
          <View style={s.table}>
            <SectionBar title="급여 정보" />
            <Row1 label="계좌번호" value={worker.account_number} />
            <Row1 label={isPartTime ? '일    당' : '월 기본급'} value={wage} />
          </View>
        )}

        {/* ── 비상 연락처 ── */}
        {sections.emergency && hasEmergency && (
          <View style={s.table}>
            <SectionBar title="비상 연락처" />
            <Row1 label="비상연락처" value={worker.emergency_contact} />
          </View>
        )}

        {/* ── 업무 이력 ── */}
        {sections.history && hasHistory && (
          <View style={s.table}>
            <SectionBar title="업무 이력" />
            <View style={s.historyHeaderRow}>
              <Text style={[s.historyHeaderCell, { width: 80 }]}>기간</Text>
              <Text style={[s.historyHeaderCell, { width: 95 }]}>근무처 / 프로젝트</Text>
              <Text style={[s.historyHeaderCell, { flex: 1, borderRight: undefined }]}>담당 업무</Text>
            </View>
            {history.map((item, i) => (
              <View key={i} style={s.historyRow}>
                <Text style={[s.historyCell, { width: 80 }]}>{item.period || '-'}</Text>
                <Text style={[s.historyCell, { width: 95 }]}>{item.company || '-'}</Text>
                <Text style={[s.historyCell, { flex: 1, borderRight: undefined }]}>{item.description || '-'}</Text>
              </View>
            ))}
          </View>
        )}

      </Page>
    </Document>
  )
}
