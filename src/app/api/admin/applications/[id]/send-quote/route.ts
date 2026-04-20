import { NextRequest, NextResponse } from 'next/server'
import { notifySlack } from '@/lib/slack'
import { sendAlimtalk } from '@/lib/solapi'

// Vercel 함수 타임아웃 60초로 확장
export const maxDuration = 60

const TEMPLATE_SPREADSHEET_ID = '1bwj2ncInTA9Vm8ac3J7YKrm4RYRSvpMVnYry-RJALu0'
const PDF_FOLDER_ID = '1H0aglzaXAvliiLmQA3c8OjVRjcpAQPPn'
const QUOTE_KAKAO_TEMPLATE_ID = 'KA01TP260219115331451o0aakYaJSp8'

function toColLetter(n: number): string {
  let s = ''
  let remaining = n
  while (remaining >= 0) {
    s = String.fromCharCode(65 + (remaining % 26)) + s
    remaining = Math.floor(remaining / 26) - 1
  }
  return s
}

function generateQuoteNo(): string {
  const now = new Date()
  const pad = (num: number, len = 2) => String(num).padStart(len, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`
  return `BBK-D-${dateStr}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface QuoteRequestBody {
  owner_name: string
  business_name: string
  phone: string
  email: string
  address: string
  care_scope: string
  construction_date: string
  supply_amount: number
  vat: number
  total_amount: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Google 인증 토큰이 없습니다' }, { status: 401 })

  const body: QuoteRequestBody = await req.json()
  const {
    owner_name, business_name, phone, email, address,
    care_scope, construction_date, supply_amount, vat, total_amount,
  } = body

  void id

  const todayStr = new Date().toISOString().slice(0, 10)
  const validUntilStr = addDays(todayStr, 5)
  const quoteNo = generateQuoteNo()

  const careScopeItems = (care_scope || '')
    .split('-')
    .map((s: string) => s.trim())
    .filter(Boolean)

  const fmtKr = (n: number) => n.toLocaleString('ko-KR')
  const safeVat = vat ?? 0

  const variables: Record<string, string> = {
    '{{고객명}}':     owner_name    || '',
    '{{상호명}}':     business_name || '',
    '{{업체명}}':     business_name || '',
    '{{연락처}}':     phone         || '',
    '{{이메일}}':     email         || '',
    '{{주소}}':       address       || '',
    '{{시공일자}}':   construction_date || '',
    '{{공급가액}}':   fmtKr(supply_amount || 0),
    '{{부가세}}':     fmtKr(safeVat),
    '{{공급대가}}':   fmtKr(total_amount || 0),
    '{{작성일자}}':   todayStr,
    '{{유효기간}}':   validUntilStr,
    '{{견적서번호}}': quoteNo,
  }
  careScopeItems.forEach((item: string, idx: number) => {
    variables[`{{항목${idx + 1}}}`] = item
  })

  let pdfUrl: string | undefined
  const errors: Record<string, string> = {}

  // ── 1~6. Google Sheets → PDF → Drive 업로드 ─────────────────────────
  try {
    // 1. 템플릿 복사
    const copyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${TEMPLATE_SPREADSHEET_ID}/copy`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `견적서_${business_name}_${quoteNo}` }),
      }
    )
    const copyData = await copyRes.json()
    if (!copyData.id) throw new Error('스프레드시트 복사 실패: ' + JSON.stringify(copyData))
    const copyId = copyData.id as string
    console.log('[send-quote] 1. 템플릿 복사 완료:', copyId)

    try {
      // 2. 시트 메타데이터
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const metaData = await metaRes.json()
      const sheetName = (metaData.sheets?.[0]?.properties?.title as string | undefined) || 'Sheet1'
      const sheetId  = (metaData.sheets?.[0]?.properties?.sheetId as number | undefined) ?? 0

      // 3. 전체 셀 읽기
      const valRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values/${encodeURIComponent(sheetName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const rows: string[][] = (await valRes.json()).values || []

      // 4. 변수 치환 + 항목 셀 수집
      const updates: { range: string; values: string[][] }[] = []
      const matchedCount = careScopeItems.length
      const itemCellRe  = /\{\{항목(\d+)\}\}/
      const itemCells: { rowIndex: number; colIndex: number }[] = []

      rows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
          let newVal = cell
          for (const [key, val] of Object.entries(variables)) {
            newVal = newVal.replaceAll(key, val)
          }
          if (newVal !== cell) {
            updates.push({ range: `${sheetName}!${toColLetter(colIdx)}${rowIdx + 1}`, values: [[newVal]] })
          }
          const m = cell.match(itemCellRe)
          if (m && parseInt(m[1], 10) <= matchedCount) {
            itemCells.push({ rowIndex: rowIdx, colIndex: colIdx })
          }
        })
      })

      if (updates.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
        })
      }
      console.log('[send-quote] 4. 변수 치환 완료, 항목:', matchedCount)

      // 4-2. 항목 셀 좌측 정렬
      if (itemCells.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${copyId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: itemCells.map(({ rowIndex, colIndex }) => ({
              repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
                fields: 'userEnteredFormat.horizontalAlignment',
              },
            })),
          }),
        })
      }

      // 4-3. 미매핑 항목 행 삭제
      const rowsToDelete = rows
        .map((row, rowIdx) => ({
          rowIdx,
          hasUnmatched: row.some(cell => { const m = cell.match(itemCellRe); return m ? parseInt(m[1], 10) > matchedCount : false }),
        }))
        .filter(r => r.hasUnmatched)
        .map(r => r.rowIdx)
        .sort((a, b) => b - a)

      if (rowsToDelete.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${copyId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: rowsToDelete.map(rowIdx => ({
              deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 } },
            })),
          }),
        })
      }

      // 5. PDF 내보내기
      const pdfRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!pdfRes.ok) throw new Error(`PDF 내보내기 실패: ${pdfRes.status}`)
      const pdfBuffer = await pdfRes.arrayBuffer()
      console.log('[send-quote] 5. PDF 내보내기 완료, 크기:', pdfBuffer.byteLength)

      // 6. Drive 지정 폴더에 업로드
      const pdfFileName = `${quoteNo}_${business_name}.pdf`
      const uploadMeta  = JSON.stringify({ name: pdfFileName, mimeType: 'application/pdf', parents: [PDF_FOLDER_ID] })
      const boundary    = 'bbk_drive_boundary'
      const enc         = new TextEncoder()
      const combined    = Buffer.concat([
        Buffer.from(enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${uploadMeta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`)),
        Buffer.from(pdfBuffer),
        Buffer.from(enc.encode(`\r\n--${boundary}--`)),
      ])
      const uploadRes  = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: combined,
      })
      const uploadData = await uploadRes.json()

      if (!uploadRes.ok || !uploadData.id) {
        errors.upload = `Drive 업로드 실패: ${uploadRes.status} ${JSON.stringify(uploadData)}`
        console.error('[send-quote]', errors.upload)
      } else {
        // 공개 공유 설정
        await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        })
        pdfUrl = `https://drive.google.com/file/d/${uploadData.id}/view`
        console.log('[send-quote] 6. Drive 업로드 완료:', pdfUrl)
      }

      // 7. 이메일 발송 — HTML 본문 + 바로보기 버튼 (PDF URL 포함)
      if (email) {
        const subject  = `[BBK 공간케어] 견적서 안내 (${quoteNo})`
        const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#333;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>안녕하세요, <strong>${owner_name}</strong>님.</p>
  <p>BBK 공간케어 견적서를 보내드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0;width:100%;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">견적서 번호</td><td>${quoteNo}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">업체명</td><td>${business_name || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">시공일자</td><td>${construction_date || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">공급가액</td><td>${fmtKr(supply_amount || 0)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">부가세</td><td>${fmtKr(safeVat)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">합계</td><td><strong>${fmtKr(total_amount || 0)}원</strong></td></tr>
    <tr><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">유효기간</td><td>${validUntilStr}까지</td></tr>
  </table>
  ${pdfUrl ? `<p><a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">견적서 바로보기</a></p>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="margin:0;">감사합니다.<br><strong>BBK 공간케어</strong></p>
</body>
</html>`

        // RFC 2822 raw 메시지 (HTML only, no attachment — 안정성 우선)
        const rawMsg = [
          `To: ${email}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(htmlBody, 'utf-8').toString('base64'),
        ].join('\r\n')

        const encoded = Buffer.from(rawMsg, 'utf-8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded }),
        })
        if (!gmailRes.ok) {
          const gmailErr = await gmailRes.json().catch(() => ({}))
          errors.email = `Gmail ${gmailRes.status}: ${JSON.stringify(gmailErr)}`
          console.error('[send-quote] Gmail 발송 실패:', errors.email)
        } else {
          console.log('[send-quote] 7. 이메일 발송 완료 →', email)
        }
      }

    } finally {
      // 8. 임시 복사본 삭제
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {})
    }
  } catch (e) {
    errors.sheet = e instanceof Error ? e.message : String(e)
    console.error('[send-quote] 처리 오류:', errors.sheet)
  }

  // 9. 카카오 알림톡
  try {
    await sendAlimtalk(
      phone,
      QUOTE_KAKAO_TEMPLATE_ID,
      {
        '고객명':    owner_name    || '',
        '업체명':    business_name || '',
        '견적서번호': quoteNo,
        '시공일자':  construction_date || '',
        '총액':      `${fmtKr(total_amount || 0)}원`,
        '유효기간':  validUntilStr,
        '견적서링크': pdfUrl || '',
      },
      `[BBK 공간케어] 견적서가 발송되었습니다. 견적서 번호: ${quoteNo}`,
    )
    console.log('[send-quote] 9. 카카오 알림톡 발송 완료 →', phone, '/ PDF URL:', pdfUrl)
  } catch (e) {
    errors.kakao = e instanceof Error ? e.message : String(e)
    console.error('[send-quote] 카카오 발송 실패:', errors.kakao)
  }

  // 10. Slack
  await notifySlack({
    notifyType: '견적서발송',
    customerName: owner_name,
    phone,
    businessName: business_name,
    constructionDate: construction_date || null,
    method: 'manual',
  }).catch(() => {})

  return NextResponse.json({
    success: Object.keys(errors).length === 0,
    quote_no: quoteNo,
    pdf_url:  pdfUrl,
    ...(Object.keys(errors).length > 0 && { errors }),
  })
}
