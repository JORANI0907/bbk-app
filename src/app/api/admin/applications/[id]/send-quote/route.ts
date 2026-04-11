import { NextRequest, NextResponse } from 'next/server'
import { notifySlack } from '@/lib/slack'
import { sendAlimtalk } from '@/lib/solapi'

const TEMPLATE_SPREADSHEET_ID = '1bwj2ncInTA9Vm8ac3J7YKrm4RYRSvpMVnYry-RJALu0'
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

  // id 사용 (향후 DB 저장 등에 활용 가능)
  void id

  const todayStr = new Date().toISOString().slice(0, 10)
  const validUntilStr = addDays(todayStr, 5)
  const quoteNo = generateQuoteNo()

  // care_scope 파싱: '-' 기준으로 항목 분리
  const careScopeItems = (care_scope as string)
    .split('-')
    .map((s: string) => s.trim())
    .filter(Boolean)

  const fmtKr = (n: number) => n.toLocaleString('ko-KR')

  // 변수 매핑
  const variables: Record<string, string> = {
    '{{고객명}}': owner_name || '',
    '{{업체명}}': business_name || '',
    '{{연락처}}': phone || '',
    '{{이메일}}': email || '',
    '{{주소}}': address || '',
    '{{시공일자}}': construction_date || '',
    '{{공급가액}}': fmtKr(supply_amount || 0),
    '{{부가세}}': fmtKr(vat || 0),
    '{{총액}}': fmtKr(total_amount || 0),
    '{{작성일자}}': todayStr,
    '{{유효기간}}': validUntilStr,
    '{{견적서번호}}': quoteNo,
  }
  careScopeItems.forEach((item: string, idx: number) => {
    variables[`{{케어범위${idx + 1}}}`] = item
  })

  let pdfUrl: string | undefined

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
      // 2. 시트 이름 가져오기
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const metaData = await metaRes.json()
      const sheetName = (metaData.sheets?.[0]?.properties?.title as string | undefined) || 'Sheet1'

      // 3. 전체 셀 값 읽기
      const valRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${copyId}/values/${encodeURIComponent(sheetName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const valData = await valRes.json()
      const rows: string[][] = valData.values || []

      // 4. {{변수}} 셀 찾아서 치환
      const updates: { range: string; values: string[][] }[] = []
      rows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
          let newVal = cell
          for (const [key, val] of Object.entries(variables)) {
            newVal = newVal.replaceAll(key, val)
          }
          if (newVal !== cell) {
            updates.push({ range: `${sheetName}!${toColLetter(colIdx)}${rowIdx + 1}`, values: [[newVal]] })
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

      // 5. PDF 내보내기
      const pdfRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!pdfRes.ok) throw new Error('PDF 내보내기 실패')
      const pdfBuffer = await pdfRes.arrayBuffer()

      // 6. PDF를 Drive에 업로드 (독립 파일로)
      const uploadMeta = JSON.stringify({ name: `${quoteNo}_${business_name}.pdf`, mimeType: 'application/pdf' })
      const boundary = 'bbk_multipart_boundary'
      const pdfBodyStart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${uploadMeta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
      const pdfBodyEnd = `\r\n--${boundary}--`
      const encoder = new TextEncoder()
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
        // 파일 공개 공유 설정
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

      // 7. 이메일 발송 (Gmail API)
      if (email) {
        const subject = `[BBK 공간케어] 견적서 안내 (${quoteNo})`
        const bodyText = [
          `안녕하세요, ${owner_name}님.`,
          '',
          'BBK 공간케어 견적서를 보내드립니다.',
          '',
          `견적서 번호: ${quoteNo}`,
          `시공일자: ${construction_date}`,
          `공급가액: ${fmtKr(supply_amount)}원`,
          `부가세: ${fmtKr(vat)}원`,
          `합계: ${fmtKr(total_amount)}원`,
          '',
          ...(pdfUrl ? [`견적서 확인: ${pdfUrl}`, ''] : []),
          `유효기간: ${validUntilStr}까지`,
          '',
          '감사합니다.',
          'BBK 공간케어',
        ].join('\n')

        // RFC 2822 형식으로 인코딩
        const rawEmail = [
          `To: ${email}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(bodyText).toString('base64'),
        ].join('\r\n')

        const encodedEmail = Buffer.from(rawEmail)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encodedEmail }),
        })
      }
    } finally {
      // 8. 임시 복사본 삭제
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${copyId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => { /* ignore cleanup errors */ })
    }
  } catch (e) {
    // Sheets 처리 실패해도 알림은 계속 진행
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('견적서 생성 오류:', errMsg)
  }

  // 9. 카카오 알림톡 발송 (Solapi)
  try {
    await sendAlimtalk(
      phone,
      QUOTE_KAKAO_TEMPLATE_ID,
      {
        '#{고객명}': owner_name,
        '#{업체명}': business_name,
        '#{견적서번호}': quoteNo,
        '#{시공일자}': construction_date || '',
        '#{총액}': `${fmtKr(total_amount)}원`,
        '#{유효기간}': validUntilStr,
        '#{링크}': pdfUrl || '',
      },
      `[BBK 공간케어] 견적서가 발송되었습니다. 견적서 번호: ${quoteNo}`,
    )
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('카카오 알림톡 발송 실패:', errMsg)
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

  return NextResponse.json({ success: true, quote_no: quoteNo, pdf_url: pdfUrl })
}
