import path from 'path'
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'

// ─── Pretendard 폰트 ──────────────────────────────────────────
const fontDir = path.join(process.cwd(), 'public', 'fonts')
Font.register({
  family: 'Pretendard',
  fonts: [
    { src: path.join(fontDir, 'Pretendard-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(fontDir, 'Pretendard-Bold.ttf'),    fontWeight: 'bold' },
  ],
})
Font.registerHyphenationCallback(word => [word])

// ─── Types ────────────────────────────────────────────────────
export interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  subtotal: number
}

export interface QuotePdfData {
  quoteNo: string
  createdAt: string
  validUntil: string
  // 고객 (수신)
  ownerName: string
  businessName: string
  phone: string
  email: string
  address: string
  constructionDate: string
  // 공급자
  companyName: string
  companyCeo: string
  companyBizNo: string
  companyPhone: string
  companyAddress: string
  // 항목 & 금액
  quoteItems: QuoteItem[]
  supplyAmount: number
  vat: number
  totalAmount: number
  // 선택
  notes?: string
  hideItemPrices?: boolean
  sealImageUrl?: string
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

// ─── 색상 토큰 ────────────────────────────────────────────────
const C = {
  brand:       '#1a73e8',
  brandDark:   '#1557b0',
  textPrimary: '#0f172a',
  textSecond:  '#475569',
  textTertiary:'#94a3b8',
  surface:     '#f8fafc',
  border:      '#e2e8f0',
  borderStrong:'#cbd5e1',
  white:       '#ffffff',
  rowAlt:      '#f8fafc',
  totalBg:     '#eff6ff',
  totalBorder: '#bfdbfe',
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Pretendard',
    fontSize: 9.5,
    color: C.textPrimary,
    paddingTop:    '20mm',
    paddingLeft:   '18mm',
    paddingRight:  '18mm',
    paddingBottom: '16mm',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: C.brand,
    borderBottomStyle: 'solid',
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: C.textPrimary,
    letterSpacing: 8,
  },
  headerMeta: {
    textAlign: 'right',
  },
  headerMetaNo: {
    fontSize: 9,
    color: C.textSecond,
    marginBottom: 2,
  },
  headerMetaDate: {
    fontSize: 8.5,
    color: C.textTertiary,
  },

  // ── Info boxes ──
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  infoBox: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  infoBoxHeader: {
    backgroundColor: C.surface,
    borderBottomWidth: 0.75,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
  },
  infoBoxTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: C.textSecond,
    letterSpacing: 2,
  },
  infoRow2: {
    flexDirection: 'row',
    paddingTop: 3.5,
    paddingBottom: 3.5,
    paddingLeft: 10,
    paddingRight: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
  },
  infoLabel: {
    width: 46,
    fontSize: 8.5,
    color: C.textTertiary,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 8.5,
    color: C.textPrimary,
    flexShrink: 1,
  },

  // ── Meta bar ──
  metaBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderWidth: 0.75,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 4,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 12,
    fontSize: 8.5,
    color: C.textSecond,
  },

  // ── Table ──
  tableWrap: {
    borderWidth: 0.75,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: C.brand,
  },
  th: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 9,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
    minHeight: 26,
    alignItems: 'flex-start',
  },
  tableRowAlt: { backgroundColor: C.rowAlt },
  td: {
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 9.5,
    color: C.textPrimary,
    flexShrink: 1,
  },
  cName: { flex: 5 },
  cQty:  { flex: 1.2, textAlign: 'right' },
  cUnit: { flex: 2.3, textAlign: 'right' },
  cSub:  { flex: 2.3, textAlign: 'right' },

  // ── Totals ──
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
  },
  totalsBox: {
    width: '46%',
    borderWidth: 0.75,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  totalRow: {
    flexDirection: 'row',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
  },
  totalLabel: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 12,
    color: C.textSecond,
    fontSize: 9,
  },
  totalValue: {
    width: 90,
    textAlign: 'right',
    fontSize: 9,
    color: C.textPrimary,
  },
  totalRowFinal: {
    backgroundColor: C.totalBg,
    borderBottomWidth: 0,
  },
  totalLabelFinal: {
    fontWeight: 'bold',
    color: C.textPrimary,
    fontSize: 10,
    letterSpacing: 2,
  },
  totalValueFinal: {
    fontWeight: 'bold',
    color: C.brand,
    fontSize: 11,
    width: 90,
    textAlign: 'right',
  },

  // ── Notes ──
  notesWrap: { marginBottom: 14 },
  notesLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: C.textSecond,
    marginBottom: 4,
    letterSpacing: 1,
  },
  notesText: {
    fontSize: 9,
    color: C.textSecond,
    lineHeight: 1.7,
    padding: 8,
    borderWidth: 0.75,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 4,
    backgroundColor: C.surface,
  },

  // ── Sign ──
  signWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
    marginTop: 4,
  },
  signInner: {
    alignItems: 'flex-end',
  },
  signNote: {
    fontSize: 8.5,
    color: C.textTertiary,
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  signLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signText: {
    fontSize: 10,
    color: C.textSecond,
    letterSpacing: 0.5,
  },
  sealImage: {
    width: 58,
    height: 58,
    opacity: 0.88,
  },

  // ── Footer ──
  footer: {
    borderTopWidth: 0.75,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
    paddingTop: 7,
    marginTop: 6,
    textAlign: 'center',
    fontSize: 8,
    color: C.textTertiary,
    letterSpacing: 0.3,
  },
})

// ─── Document ─────────────────────────────────────────────────
function QuotePdfDocument({ d }: { d: QuotePdfData }) {
  const customerFields: [string, string][] = [
    ['업체명', d.businessName],
    ['대표자', d.ownerName],
    ['연락처', d.phone],
    ...(d.email            ? [['이메일', d.email] as [string, string]]              : []),
    ['주  소', d.address],
    ...(d.constructionDate ? [['시공일자', d.constructionDate] as [string, string]]  : []),
  ]

  const companyFields: [string, string][] = [
    ['상  호', d.companyName],
    ['대표자', d.companyCeo],
    ['사업자', d.companyBizNo],
    ['연락처', d.companyPhone],
    ['주  소', d.companyAddress],
  ]

  const items = d.quoteItems.filter(i => i.name.trim())

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>견  적  서</Text>
          <View style={s.headerMeta}>
            <Text style={s.headerMetaNo}>{d.quoteNo}</Text>
            <Text style={s.headerMetaDate}>작성일 {d.createdAt}</Text>
          </View>
        </View>

        {/* ── Info boxes ── */}
        <View style={s.infoRow}>
          {/* 수신 */}
          <View style={s.infoBox}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxTitle}>수  신</Text>
            </View>
            {customerFields.map(([label, value]) => (
              <View key={label} style={s.infoRow2}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value || '—'}</Text>
              </View>
            ))}
          </View>

          {/* 공급자 */}
          <View style={s.infoBox}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxTitle}>공  급  자</Text>
            </View>
            {companyFields.map(([label, value]) => (
              <View key={label} style={s.infoRow2}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value || '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Meta bar ── */}
        <View style={s.metaBar}>
          <Text>작성일  {d.createdAt}</Text>
          <Text>견적 유효기간  {d.validUntil}까지</Text>
        </View>

        {/* ── Table ── */}
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <Text style={[s.th, s.cName]}>항  목  명</Text>
            {!d.hideItemPrices && <Text style={[s.th, s.cQty]}>수량</Text>}
            {!d.hideItemPrices && <Text style={[s.th, s.cUnit]}>단가 (원)</Text>}
            {!d.hideItemPrices && <Text style={[s.th, s.cSub]}>소계 (원)</Text>}
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={[s.tableRow, ...(idx % 2 === 1 ? [s.tableRowAlt] : [])]}>
              <Text style={[s.td, s.cName]}>{item.name}</Text>
              {!d.hideItemPrices && <Text style={[s.td, s.cQty]}>{item.qty}</Text>}
              {!d.hideItemPrices && <Text style={[s.td, s.cUnit]}>{fmtKr(item.unit_price)}</Text>}
              {!d.hideItemPrices && <Text style={[s.td, s.cSub]}>{fmtKr(item.subtotal)}</Text>}
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>공급가액</Text>
              <Text style={s.totalValue}>{fmtKr(d.supplyAmount)}원</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>부가세 (10%)</Text>
              <Text style={s.totalValue}>{fmtKr(d.vat)}원</Text>
            </View>
            <View style={[s.totalRow, s.totalRowFinal]}>
              <Text style={[s.totalLabel, s.totalLabelFinal]}>합  계</Text>
              <Text style={s.totalValueFinal}>{fmtKr(d.totalAmount)}원</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ── */}
        {d.notes && (
          <View style={s.notesWrap}>
            <Text style={s.notesLabel}>특이사항</Text>
            <Text style={s.notesText}>{d.notes}</Text>
          </View>
        )}

        {/* ── Sign + Seal ── */}
        <View style={s.signWrap}>
          <View style={s.signInner}>
            <Text style={s.signNote}>위 금액을 견적합니다.</Text>
            <View style={s.signLine}>
              <Text style={s.signText}>
                {d.companyName}  대표  {d.companyCeo}  (인)
              </Text>
              {d.sealImageUrl && (
                <Image src={d.sealImageUrl} style={s.sealImage} />
              )}
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text>
            {d.companyName}  ·  사업자등록번호 {d.companyBizNo}  ·  대표 {d.companyCeo}  ·  {d.companyPhone}
          </Text>
        </View>

      </Page>
    </Document>
  )
}

// ─── Public API ───────────────────────────────────────────────
export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  return renderToBuffer(<QuotePdfDocument d={data} />) as Promise<Buffer>
}
