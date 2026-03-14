const crypto = require('crypto');

const SOLAPI_API_KEY = 'NCS62LDUONLPJ5VJ';
const SOLAPI_API_SECRET = '8C5OWUCIT3HW4J0YGBT3GHEJSW6P8T4Q';
const SOLAPI_SENDER = '0317594877';

// 인증번호 저장소 (메모리 - Lambda 인스턴스 내)
const verificationCodes = {};

function generateSignature(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const hmac = crypto.createHmac('sha256', apiSecret);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return { date, salt, signature };
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { phone, action } = JSON.parse(event.body);

    // === 인증번호 발송 ===
    if (action === 'send') {
      if (!phone || !/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone.replace(/-/g, ''))) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ success: false, message: '유효한 연락처를 입력해주세요.' })
        };
      }

      const cleanPhone = phone.replace(/-/g, '');
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 인증번호 저장 (3분 유효)
      verificationCodes[cleanPhone] = {
        code: code,
        expires: Date.now() + 3 * 60 * 1000
      };

      // Solapi API 호출
      const { date, salt, signature } = generateSignature(SOLAPI_API_KEY, SOLAPI_API_SECRET);

      const response = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
        },
        body: JSON.stringify({
          message: {
            to: cleanPhone,
            from: SOLAPI_SENDER,
            text: `[BBK 공간케어] 인증번호는 [${code}]입니다. 3분 내에 입력해주세요.`
          }
        })
      });

      const result = await response.json();

      if (response.ok) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ 
            success: true, 
            message: '인증번호가 발송되었습니다.',
            // 서버에서 코드를 암호화하여 전달 (프론트에서 검증용)
            token: crypto.createHash('sha256').update(code + cleanPhone).digest('hex'),
            expiresIn: 180
          })
        };
      } else {
        console.error('Solapi error:', result);
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ success: false, message: 'SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' })
        };
      }
    }

    // === 인증번호 검증 ===
    if (action === 'verify') {
      const { code, token } = JSON.parse(event.body);
      const cleanPhone = phone.replace(/-/g, '');
      
      // 토큰 기반 검증 (해시 비교)
      const expectedToken = crypto.createHash('sha256').update(code + cleanPhone).digest('hex');
      
      if (token === expectedToken) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ success: true, verified: true, message: '인증이 완료되었습니다.' })
        };
      } else {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ success: true, verified: false, message: '인증번호가 일치하지 않습니다.' })
        };
      }
    }

    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ success: false, message: '서버 오류가 발생했습니다.' })
    };
  }
};
