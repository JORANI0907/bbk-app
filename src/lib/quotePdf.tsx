import path from 'path'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// ─── Korean font (NanumGothic) ────────────────────────────────
const fontDir = path.join(process.cwd(), 'public', 'fonts')
Font.register({
  family: 'NanumGothic',
  fonts: [
    { src: path.join(fontDir, 'NanumGothic-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(fontDir, 'NanumGothic-Bold.ttf'),    fontWeight: 'bold' },
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
  // 공급자 (동적)
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
  // 선택 항목
  notes?: string
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'NanumGothic',
    fontSize: 10.5,
    color: '#222',
    paddingTop: '20mm',
    paddingLeft: '18mm',
    paddingRight: '18mm',
    paddingBottom: '15mm',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: '#1a73e8',
    borderBottomStyle: 'solid',
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111', letterSpacing: 6 },
  quoteNo: { fontSize: 10, color: '#888', marginBottom: 2 },

  // Info boxes
  infoRow: { flexDirection: 'row', marginBottom: 10 },
  infoBox: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: '#d0d0d0',
    borderStyle: 'solid',
    borderRadius: 3,
  },
  infoBoxLeft: { marginRight: 10 },
  infoBoxTitle: {
    backgroundColor: '#f0f4f8',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#444',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d0d0d0',
    borderBottomStyle: 'solid',
  },
  infoFieldRow: { flexDirection: 'row', paddingTop: 3, paddingBottom: 3, paddingLeft: 8, paddingRight: 8 },
  infoLabel: { width: 50, color: '#777', fontSize: 9.5, flexShrink: 0 },
  infoValue: { flex: 1, color: '#222', fontSize: 9.5, flexShrink: 1 },

  // Meta bar
  metaBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f7f9fc',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 3,
    marginBottom: 10,
    fontSize: 9.5,
    color: '#555',
  },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: '#1a73e8', borderRadius: 2 },
  th: { paddingTop: 6, paddingBottom: 6, paddingLeft: 6, paddingRight: 6, fontSize: 10, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ebebeb',
    borderBottomStyle: 'solid',
    minHeight: 24,
    alignItems: 'flex-start',
  },
  tableRowAlt: { backgroundColor: '#fafcff' },
  td: { paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6, fontSize: 10, color: '#222', flexShrink: 1 },
  cName: { flex: 5 },
  cQty:  { flex: 1.2, textAlign: 'right' },
  cUnit: { flex: 2.3, textAlign: 'right' },
  cSub:  { flex: 2.3, textAlign: 'right' },

  // Totals
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, marginBottom: 16 },
  totalsBox: { width: '48%' },
  totalRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    borderBottomStyle: 'solid',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
  },
  totalLabel: { flex: 1, textAlign: 'right', paddingRight: 10, color: '#666', fontSize: 10 },
  totalValue: { width: 90, textAlign: 'right', fontSize: 10, color: '#333' },
  totalRowFinal: {
    backgroundColor: '#eaf3ff',
    borderTopWidth: 1,
    borderTopColor: '#1a73e8',
    borderTopStyle: 'solid',
    marginTop: 2,
  },
  totalLabelFinal: { fontWeight: 'bold', color: '#111', fontSize: 10.5 },
  totalValueFinal: { fontWeight: 'bold', color: '#1a73e8', fontSize: 10.5 },

  // Notes
  notesWrap: { marginBottom: 14 },
  notesLabel: { fontSize: 9.5, fontWeight: 'bold', color: '#444', marginBottom: 4 },
  notesText: {
    fontSize: 9.5,
    color: '#555',
    lineHeight: 1.6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    borderWidth: 0.5,
    borderColor: '#d0d0d0',
    borderStyle: 'solid',
    borderRadius: 3,
  },

  // Sign
  signWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  signBox: { textAlign: 'right', fontSize: 10, color: '#444' },
  signNote: { fontSize: 9.5, color: '#888', marginBottom: 4 },

  // Footer
  footer: {
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    borderTopStyle: 'solid',
    paddingTop: 6,
    marginTop: 6,
    textAlign: 'center',
    fontSize: 9,
    color: '#aaa',
  },
})

// ─── Document component ───────────────────────────────────────
function QuotePdfDocument({ d }: { d: QuotePdfData }) {
  const customerFields: [string, string][] = [
    ['업체명', d.businessName],
    ['대표자', d.ownerName],
    ['연락처', d.phone],
    ...(d.email            ? [['이메일', d.email] as [string, string]]            : []),
    ['주  소', d.address],
    ...(d.constructionDate ? [['시공일자', d.constructionDate] as [string, string]] : []),
  ]

  const companyFields: [string, string][] = [
    ['상  호', d.companyName],
    ['대표자', d.companyCeo],
    ['사업자', d.companyBizNo],
    ['연락처', d.companyPhone],
    ['주  소', d.companyAddress],
  ]

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.title}>견  적  서</Text>
          <Text style={s.quoteNo}>{d.quoteNo}</Text>
        </View>

        {/* Info: 수신 | 공급자 */}
        <View style={s.infoRow}>
          <View style={[s.infoBox, s.infoBoxLeft]}>
            <Text style={s.infoBoxTitle}>수  신</Text>
            {customerFields.map(([label, value]) => (
              <View key={label} style={s.infoFieldRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value || '-'}</Text>
              </View>
            ))}
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoBoxTitle}>공  급  자</Text>
            {companyFields.map(([label, value]) => (
              <View key={label} style={s.infoFieldRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value || '-'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaBar}>
          <Text>작성일: {d.createdAt}</Text>
          <Text>유효기간: {d.validUntil}까지</Text>
        </View>

        {/* Table */}
        <View style={s.tableHead}>
          <Text style={[s.th, s.cName]}>항  목  명</Text>
          <Text style={[s.th, s.cQty]}>수량</Text>
          <Text style={[s.th, s.cUnit]}>단가 (원)</Text>
          <Text style={[s.th, s.cSub]}>소계 (원)</Text>
        </View>
        {d.quoteItems.map((item, idx) => (
          <View key={idx} style={[s.tableRow, ...(idx % 2 === 1 ? [s.tableRowAlt] : [])]}>
            <Text style={[s.td, s.cName]}>{item.name}</Text>
            <Text style={[s.td, s.cQty]}>{item.qty}</Text>
            <Text style={[s.td, s.cUnit]}>{fmtKr(item.unit_price)}</Text>
            <Text style={[s.td, s.cSub]}>{fmtKr(item.subtotal)}</Text>
          </View>
        ))}

        {/* Totals */}
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
              <Text style={[s.totalValue, s.totalValueFinal]}>{fmtKr(d.totalAmount)}원</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {d.notes && (
          <View style={s.notesWrap}>
            <Text style={s.notesLabel}>특이사항</Text>
            <Text style={s.notesText}>{d.notes}</Text>
          </View>
        )}

        {/* Sign */}
        <View style={s.signWrap}>
          <View style={s.signBox}>
            <Text style={s.signNote}>위 금액을 견적합니다.</Text>
            <Text>{d.companyName}  대표  {d.companyCeo}  (인)</Text>
          </View>
        </View>

        {/* Footer */}
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
