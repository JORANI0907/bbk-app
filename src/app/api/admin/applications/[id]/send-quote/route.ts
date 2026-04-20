import { NextRequest, NextResponse } from 'next/server'
import { notifySlack } from '@/lib/slack'
import { sendAlimtalk } from '@/lib/solapi'

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

  // care_scope 파싱: '-' 기준으로 항목 분리
  const careScopeItems = (care_scope || '')
    .split('-')
    .map((s: string) => s.trim())
    .filter(Boolean)

  const fmtKr = (n: number) => n.toLocaleString('ko-KR')
  const safeVat = vat ?? 0

  // 변수 매핑 (세부화면 필드 → 템플릿 플레이스홀더)
  // 없는 필드는 공백, 부가세는 0으로
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
  let pdfBuffer: ArrayBuffer | undefined
  let sheetError: string | undefined
  let emailError: string | undefined

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

    try {
      // 2. 시트 이름 + sheetId 가져오기
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const metaData = await metaRes.json()
      const sheetName = (metaData.sheets?.[0]?.properties?.title as string | undefined) || 'Sheet1'
      const sheetId = (metaData.sheets?.[0]?.properties?.sheetId as number | undefined) ?? 0

      // 3. 전체 셀 값 읽기
      const valRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values/${encodeURIComponent(sheetName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const valData = await valRes.json()
      const rows: string[][] = valData.values || []

      // 4. {{변수}} 셀 찾아서 치환 + 항목 셀 위치 수집 (좌측 정렬용)
      const updates: { range: string; values: string[][] }[] = []
      const matchedCount = careScopeItems.length
      const itemCells: { rowIndex: number; colIndex: number }[] = []
      const itemCellRe = /\{\{항목(\d+)\}\}/

      rows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
          let newVal = cell
          for (const [key, val] of Object.entries(variables)) {
            newVal = newVal.replaceAll(key, val)
          }
          if (newVal !== cell) {
            updates.push({ range: `${sheetName}!${toColLetter(colIdx)}${rowIdx + 1}`, values: [[newVal]] })
          }
          // 매핑된 항목 셀 위치 기록 (좌측 정렬 적용 대상)
          const m = cell.match(itemCellRe)
          if (m && parseInt(m[1], 10) <= matchedCount) {
            itemCells.push({ rowIndex: rowIdx, colIndex: colIdx })
          }
        })
      })

      if (updates.length > 0) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
          }
        )
      }

      // 4-2. 항목 셀 좌측 정렬 적용
      if (itemCells.length > 0) {
        const alignRequests = itemCells.map(({ rowIndex, colIndex }) => ({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
            fields: 'userEnteredFormat.horizontalAlignment',
          },
        }))
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${copyId}:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: alignRequests }),
          }
        )
      }

      // 4-3. 매핑되지 않은 {{항목N}} 행만 삭제 (matched 항목 행은 유지)
      const rowsToDelete = rows
        .map((row, rowIdx) => {
          const hasUnmatched = row.some(cell => {
            const m = cell.match(itemCellRe)
            return m ? parseInt(m[1], 10) > matchedCount : false
          })
          return { rowIdx, hasUnmatched }
        })
        .filter(r => r.hasUnmatched)
        .map(r => r.rowIdx)
        .sort((a, b) => b - a)

      if (rowsToDelete.length > 0) {
        const deleteRequests = rowsToDelete.map(rowIdx => ({
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
          },
        }))
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${copyId}:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: deleteRequests }),
          }
        )
      }

      // 5. PDF 내보내기
      const pdfRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!pdfRes.ok) throw new Error('PDF 내보내기 실패')
      pdfBuffer = await pdfRes.arrayBuffer()

      // 6. PDF를 지정 폴더에 업로드
      const pdfFileName = `${quoteNo}_${business_name}.pdf`
      const uploadMeta = JSON.stringify({
        name: pdfFileName,
        mimeType: 'application/pdf',
        parents: [PDF_FOLDER_ID],
      })
      const boundary = 'bbk_multipart_boundary'
      const encoder = new TextEncoder()
      const pdfBodyStart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${uploadMeta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
      const pdfBodyEnd = `\r\n--${boundary}--`
      const combinedBuffer = Buffer.concat([
        Buffer.from(encoder.encode(pdfBodyStart)),
        Buffer.from(pdfBuffer),
        Buffer.from(encoder.encode(pdfBodyEnd)),
      ])
      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: combinedBuffer,
        }
      )
      const uploadData = await uploadRes.json()
      if (uploadData.id) {
        // 누구나 볼 수 있도록 공개 공유 설정
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' }),
          }
        )
        pdfUrl = `https://drive.google.com/file/d/${uploadData.id}/view`
      }

      // 7. 이메일 발송 — HTML 본문 + PDF 첨부 + 바로보기 버튼 (Gmail API)
      if (email) {
        const subject = `[BBK 공간케어] 견적서 안내 (${quoteNo})`
        const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#333;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>안녕하세요, <strong>${owner_name}</strong>님.</p>
  <p>BBK 공간케어 견적서를 보내드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0;width:100%;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">견적서 번호</td><td style="padding:6px 0;">${quoteNo}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">업체명</td><td style="padding:6px 0;">${business_name || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">시공일자</td><td style="padding:6px 0;">${construction_date || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">공급가액</td><td style="padding:6px 0;">${fmtKr(supply_amount || 0)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">부가세</td><td style="padding:6px 0;">${fmtKr(safeVat)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">합계</td><td style="padding:6px 0;"><strong>${fmtKr(total_amount || 0)}원</strong></td></tr>
    <tr><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">유효기간</td><td style="padding:6px 0;">${validUntilStr}까지</td></tr>
  </table>
  ${pdfUrl ? `<p><a href="${pdfUrl}" style="display:inline-block;padding:11px 24px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">견적서 바로보기</a></p>` : ''}
  <p style="color:#aaa;font-size:12px;margin-top:24px;">견적서 파일은 첨부파일로도 확인하실 수 있습니다.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="margin:0;">감사합니다.<br><strong>BBK 공간케어</strong></p>
</body>
</html>`

        const emailBoundary = 'bbk_email_mixed_boundary'
        const pdfB64 = Buffer.from(pdfBuffer).toString('base64')
        const htmlB64 = Buffer.from(htmlBody).toString('base64')

        const rawEmailParts = [
          `To: ${email}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${emailBoundary}"`,
          '',
          `--${emailBoundary}`,
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          htmlB64,
          '',
          `--${emailBoundary}`,
          `Content-Type: application/pdf; name="${pdfFileName}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${pdfFileName}"`,
          '',
          pdfB64,
          '',
          `--${emailBoundary}--`,
        ].join('\r\n')

        const encodedEmail = Buffer.from(rawEmailParts)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encodedEmail }),
        })
        if (!gmailRes.ok) {
          const gmailErr = await gmailRes.json().catch(() => ({}))
          emailError = `Gmail ${gmailRes.status}: ${JSON.stringify(gmailErr)}`
          console.error('Gmail 발송 실패:', emailError)
        }
      }
    } finally {
      // 8. 임시 복사본 삭제
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => { /* ignore cleanup errors */ })
    }
  } catch (e) {
    sheetError = e instanceof Error ? e.message : String(e)
    console.error('견적서 생성 오류:', sheetError)
  }

  // 9. 카카오 알림톡 발송 (Solapi)
  let kakaoError: string | undefined
  try {
    await sendAlimtalk(
      phone,
      QUOTE_KAKAO_TEMPLATE_ID,
      {
        '고객명':    owner_name,
        '업체명':    business_name,
        '견적서번호': quoteNo,
        '시공일자':  construction_date || '',
        '총액':      `${fmtKr(total_amount || 0)}원`,
        '유효기간':  validUntilStr,
        '견적서링크': pdfUrl || '',
      },
      `[BBK 공간케어] 견적서가 발송되었습니다. 견적서 번호: ${quoteNo}`,
    )
  } catch (e) {
    kakaoError = e instanceof Error ? e.message : String(e)
    console.error('카카오 알림톡 발송 실패:', kakaoError)
  }

  // 10. Slack 보고
  try {
    await notifySlack({
      notifyType: '견적서발송',
      customerName: owner_name,
      phone,
      businessName: business_name,
      constructionDate: construction_date || null,
      method: 'manual',
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('Slack 보고 실패:', errMsg)
  }

  return NextResponse.json({
    success: true,
    quote_no: quoteNo,
    pdf_url: pdfUrl,
    ...(sheetError  && { sheet_error: sheetError }),
    ...(emailError  && { email_error: emailError }),
    ...(kakaoError  && { kakao_error: kakaoError }),
  })
}
