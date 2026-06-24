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

const ACCENT    = '#1a3a5c'
const BORDER    = '#bbb'
const LABEL_BG  = '#f0f2f5'

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
  // ── 헤더 ──
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
  // ── 테이블 공통 ──
  table: { border: `0.5pt solid ${BORDER}`, marginBottom: 7 },
  sectionBar: {
    backgroundColor: ACCENT,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
  },
  sectionBarText: { color: '#fff', fontWeight: 700, fontSize: 8 },
  row:     { flexDirection: 'row', borderBottom: `0.5pt solid ${BORDER}` },
  rowLast: { flexDirection: 'row' },
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
  // ── 인적사항+사진 ──
  topBlock: {
    flexDirection: 'row',
    border: `0.5pt solid ${BORDER}`,
    marginBottom: 7,
  },
  infoCol: { flex: 1, borderRight: `0.5pt solid ${BORDER}` },
  photoCol: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  photoImg: { width: 68, height: 88, objectFit: 'cover' },
  photoEmpty: {
    width: 68,
    height: 88,
    border: `0.5pt solid ${BORDER}`,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyText: { fontSize: 7, color: '#aaa' },
  // ── 업무이력 ──
  historyHeader: {
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
  historyRow: {
    flexDirection: 'row',
    borderBottom: `0.5pt solid ${BORDER}`,
  },
  historyRowLast: { flexDirection: 'row' },
  historyCell: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 8.2,
    borderRight: `0.5pt solid ${BORDER}`,
  },
})

function SectionBar({ title }: { title: string }) {
  return (
    <View style={s.sectionBar}>
      <Text style={s.sectionBarText}>{title}</Text>
    </View>
  )
}

function Row1({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={last ? s.rowLast : s.row}>
      <View style={s.labelCell}><Text>{label}</Text></View>
      <View style={s.valueCell}><Text>{value || '-'}</Text></View>
    </View>
  )
}

function Row2({ l1, v1, l2, v2, last }: {
  l1: string; v1?: string | null
  l2: string; v2?: string | null
  last?: boolean
}) {
  return (
    <View style={last ? s.rowLast : s.row}>
      <View style={s.labelCell}><Text>{l1}</Text></View>
      <View style={[s.valueCell, { borderRight: `0.5pt solid ${BORDER}` }]}><Text>{v1 || '-'}</Text></View>
      <View style={s.labelCell}><Text>{l2}</Text></View>
      <View style={s.valueCell}><Text>{v2 || '-'}</Text></View>
    </View>
  )
}

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
      ].filter(Boolean).join('  /  ') || '-'
    : worker.avg_salary ? `${worker.avg_salary.toLocaleString()}원` : '-'

  const history: WorkHistoryEntry[] = (() => {
    try { return JSON.parse(worker.work_history ?? '[]') as WorkHistoryEntry[] }
    catch { return [] }
  })()

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
        {sections.personal && (
          <View style={s.topBlock}>
            <View style={s.infoCol}>
              <SectionBar title="인적사항" />
              <View style={s.row}>
                <View style={s.labelCell}><Text>성    명</Text></View>
                <View style={[s.valueCell, { fontWeight: 700, flex: 1.5, borderRight: `0.5pt solid ${BORDER}` }]}>
                  <Text>{worker.name}</Text>
                </View>
                <View style={s.labelCell}><Text>고용형태</Text></View>
                <View style={s.valueCell}><Text>{worker.employment_type || '-'}</Text></View>
              </View>
              <View style={s.row}>
                <View style={s.labelCell}><Text>생년월일</Text></View>
                <View style={[s.valueCell, { flex: 1.5, borderRight: `0.5pt solid ${BORDER}` }]}>
                  <Text>{worker.birth_date || '-'}</Text>
                </View>
                <View style={s.labelCell}><Text>혈  액  형</Text></View>
                <View style={s.valueCell}>
                  <Text>{worker.blood_type ? `${worker.blood_type}형` : '-'}</Text>
                </View>
              </View>
              <View style={s.row}>
                <View style={s.labelCell}><Text>성    별</Text></View>
                <View style={[s.valueCell, { flex: 1.5, borderRight: `0.5pt solid ${BORDER}` }]}>
                  <Text>{worker.gender || '-'}</Text>
                </View>
                <View style={s.labelCell}><Text>연  락  처</Text></View>
                <View style={s.valueCell}><Text>{worker.phone || '-'}</Text></View>
              </View>
              <View style={s.row}>
                <View style={s.labelCell}><Text>이  메  일</Text></View>
                <View style={[s.valueCell, { flex: 3 }]}><Text>{worker.email || '-'}</Text></View>
              </View>
              <View style={s.rowLast}>
                <View style={s.labelCell}><Text>주    소</Text></View>
                <View style={[s.valueCell, { flex: 3 }]}><Text>{worker.home_address || '-'}</Text></View>
              </View>
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
        {sections.job && (
          <View style={s.table}>
            <SectionBar title="직무 정보" />
            {!isPartTime ? (
              <>
                <Row2 l1="부    서" v1={worker.department} l2="직    급" v2={worker.position} />
                <Row2 l1="직    책" v1={worker.job_title}  l2="입  사  일" v2={worker.join_date || undefined} />
              </>
            ) : (
              <Row2 l1="숙  련  도" v1={worker.skill_level} l2="고용형태" v2={worker.employment_type} />
            )}
            <Row1 label="특화작업" value={worker.specialties} last />
          </View>
        )}

        {/* ── 급여 정보 ── */}
        {sections.salary && (
          <View style={s.table}>
            <SectionBar title="급여 정보" />
            <Row1 label="계좌번호" value={worker.account_number} />
            <Row1 label={isPartTime ? '일    당' : '월 기본급'} value={wage} last />
          </View>
        )}

        {/* ── 비상 연락처 ── */}
        {sections.emergency && (
          <View style={s.table}>
            <SectionBar title="비상 연락처" />
            <Row1 label="비상연락처" value={worker.emergency_contact} last />
          </View>
        )}

        {/* ── 업무 이력 ── */}
        {sections.history && history.length > 0 && (
          <View style={s.table}>
            <SectionBar title="업무 이력" />
            <View style={s.historyHeader}>
              <Text style={[s.historyHeaderCell, { width: 80 }]}>기간</Text>
              <Text style={[s.historyHeaderCell, { width: 90 }]}>근무처 / 프로젝트</Text>
              <Text style={[s.historyHeaderCell, { flex: 1, borderRight: undefined }]}>담당 업무</Text>
            </View>
            {history.map((item, i) => {
              const isLast = i === history.length - 1
              return (
                <View key={i} style={isLast ? s.historyRowLast : s.historyRow}>
                  <Text style={[s.historyCell, { width: 80 }]}>{item.period || '-'}</Text>
                  <Text style={[s.historyCell, { width: 90 }]}>{item.company || '-'}</Text>
                  <Text style={[s.historyCell, { flex: 1, borderRight: undefined }]}>{item.description || '-'}</Text>
                </View>
              )
            })}
          </View>
        )}

      </Page>
    </Document>
  )
}
