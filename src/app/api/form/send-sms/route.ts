import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY ?? 'NCS62LDUONLPJ5VJ'
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET ?? '8C5OWUCIT3HW4J0YGBT3GHEJSW6P8T4Q'
const SOLAPI_SENDER = process.env.SOLAPI_SENDER ?? '0317594877'

function generateSignature() {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const hmac = crypto.createHmac('sha256', SOLAPI_API_SECRET)
  hmac.update(date + salt)
  const signature = hmac.digest('hex')
  return { date, salt, signature }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

export async function POST(req: NextRequest) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  try {
    const body = await req.json()
    const { phone, action, code, token } = body

    // === 인증번호 발송 ===
    if (action === 'send') {
      if (!phone || !/^01[016789]\d{7,8}$/.test(phone.replace(/-/g, ''))) {
        return NextResponse.json(
          { success: false, message: '유효한 연락처를 입력해주세요.' },
          { status: 400, headers: cors }
        )
      }

      const cleanPhone = phone.replace(/-/g, '')
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString()

      const { date, salt, signature } = generateSignature()

      const response = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
        },
        body: JSON.stringify({
          message: {
            to: cleanPhone,
            from: SOLAPI_SENDER,
            text: `[BBK 공간케어] 인증번호는 [${verifyCode}]입니다. 3분 내에 입력해주세요.`,
          },
        }),
      })

      if (response.ok) {
        const responseToken = crypto
          .createHash('sha256')
          .update(verifyCode + cleanPhone)
          .digest('hex')

        return NextResponse.json(
          {
            success: true,
            message: '인증번호가 발송되었습니다.',
            token: responseToken,
            expiresIn: 180,
          },
          { status: 200, headers: cors }
        )
      } else {
        const err = await response.json()
        console.error('Solapi error:', err)
        return NextResponse.json(
          { success: false, message: 'SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 500, headers: cors }
        )
      }
    }

    // === 인증번호 검증 ===
    if (action === 'verify') {
      if (!phone || !code || !token) {
        return NextResponse.json(
          { success: false, message: '필수 값이 누락되었습니다.' },
          { status: 400, headers: cors }
        )
      }

      const cleanPhone = phone.replace(/-/g, '')
      const expectedToken = crypto
        .createHash('sha256')
        .update(code + cleanPhone)
        .digest('hex')

      if (token === expectedToken) {
        return NextResponse.json(
          { success: true, verified: true, message: '인증이 완료되었습니다.' },
          { status: 200, headers: cors }
        )
      } else {
        return NextResponse.json(
          { success: true, verified: false, message: '인증번호가 일치하지 않습니다.' },
          { status: 200, headers: cors }
        )
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: cors })
  } catch (error) {
    console.error('send-sms error:', error)
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500, headers: cors }
    )
  }
}
