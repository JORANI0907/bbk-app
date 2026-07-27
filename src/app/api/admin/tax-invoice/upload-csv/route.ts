/**
 * 세금계산서 CSV → Google Drive 지정 폴더에 Google Sheets 문서로 저장.
 *
 * 클라이언트가 buildHometaxCsv로 생성한 CSV 문자열을 그대로 POST.
 * 서버는 UTF-8 BOM을 앞에 붙여 Buffer로 변환한 뒤,
 * Drive API의 자동 변환(convertToMimeType)을 사용해 Google Sheets 문서로 저장.
 *
 * 성공 시 { success, fileId, webViewLink } 반환.
 * 실패 시 클라이언트는 로컬 CSV 다운로드로 fallback.
 */

import { NextRequest, NextResponse } from 'next/server'
import { uploadToDrive, TAX_INVOICE_FOLDER_ID, GOOGLE_SHEET_MIME } from '@/lib/driveUpload'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { filename?: string; csv?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filename = (body.filename ?? '').trim()
  const csv = body.csv ?? ''
  if (!filename || !csv) {
    return NextResponse.json({ error: 'filename, csv 필수' }, { status: 400 })
  }
  if (!filename.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: '.csv 확장자만 허용됩니다.' }, { status: 400 })
  }
  if (csv.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'CSV 크기 5MB 초과' }, { status: 413 })
  }

  // UTF-8 BOM 붙여 한글 호환 (Google Sheets 변환 시에도 안전)
  const buffer = Buffer.from('﻿' + csv, 'utf8')

  // Google Sheets 파일명은 확장자가 없어 .csv 접미사 제거
  const sheetName = filename.replace(/\.csv$/i, '')

  try {
    const { fileId, webViewLink } = await uploadToDrive(
      buffer,
      sheetName,
      'text/csv',
      TAX_INVOICE_FOLDER_ID,
      { convertToMimeType: GOOGLE_SHEET_MIME },
    )
    if (!fileId) {
      return NextResponse.json({
        error: 'Google Drive 인증 미설정 — GOOGLE_REFRESH_TOKEN 확인 필요.',
      }, { status: 500 })
    }
    return NextResponse.json({ success: true, fileId, webViewLink })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[tax-invoice/upload-csv] Drive 업로드 실패:', msg)
    return NextResponse.json({ error: `Drive 업로드 실패: ${msg}` }, { status: 500 })
  }
}
