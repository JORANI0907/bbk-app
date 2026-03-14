// ============================================================
// 📋 BBK 공간케어 신청서 - Google Apps Script (v3)
// ============================================================

var SPREADSHEET_ID = '1E4SEiwFBKks63HdP__Q4E0aJjX87Lf0n0g3iWl3Lilg';

// ✅ BBK 앱 웹훅 URL
var BBK_WEBHOOK_URL = 'https://bbk-korea-app.netlify.app/api/webhooks/application';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('form')
    .setTitle('BBK 공간케어 신청서')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function submitForm(formData) {
  try {
    // 1) 스프레드시트 열기
    var ss;
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      return {
        success: false,
        message: '스프레드시트를 열 수 없습니다. ID를 확인해주세요.\nID: ' + SPREADSHEET_ID + '\n오류: ' + e.toString()
      };
    }

    if (!ss) {
      return {
        success: false,
        message: '스프레드시트 객체가 null입니다. ID를 다시 확인해주세요.\nID: ' + SPREADSHEET_ID
      };
    }

    // 2) 시트 찾기 또는 생성
    var sheet = ss.getSheetByName('신청서');

    if (!sheet) {
      sheet = ss.insertSheet('신청서');

      var headers = [
        '접수일시', '대표자 성함(사업자명)', '플랫폼 닉네임', '연락처',
        '주소', '상호명', '사업자등록번호', '이메일 아이디', '이메일 주소',
        '영업시작 시간', '영업종료 시간', '엘리베이터 사용', '건물 출입 신청 필요',
        '출입 방법(비밀번호)', '주차 방법', '결제 방법', '계좌번호',
        '개인정보 동의', '안내사항 동의', '요청/안내 사항'
      ];

      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1a73e8');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
      headerRange.setFontSize(10);

      sheet.setRowHeight(1, 40);
      for (var i = 1; i <= headers.length; i++) {
        sheet.setColumnWidth(i, 150);
      }
      sheet.setColumnWidth(1, 170);
      sheet.setColumnWidth(5, 300);
      sheet.setColumnWidth(14, 200);
      sheet.setColumnWidth(20, 300);
      sheet.getRange(1, 1, 1, headers.length).createFilter();
      sheet.setFrozenRows(1);
    }

    // 3) 데이터 저장
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    var row = [
      timestamp,
      formData.ownerName || '',
      formData.platformNickname || '',
      formData.phone || '',
      formData.address || '',
      formData.businessName || '',
      formData.businessNumber || '',
      formData.emailId || '',
      formData.emailDomain || '',
      formData.businessHoursStart || '',
      formData.businessHoursEnd || '',
      formData.elevator || '',
      formData.buildingAccess || '',
      formData.accessMethod || '',
      formData.parking || '',
      formData.paymentMethod || '',
      formData.accountNumber || '',
      formData.privacyConsent ? '동의' : '미동의',
      formData.serviceConsent ? '동의' : '미동의',
      formData.requestNotes || ''
    ];

    sheet.appendRow(row);

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1, 1, row.length)
      .setVerticalAlignment('middle')
      .setWrap(true);

    // 웹훅 공통 페이로드
    var webhookPayload = {
      timestamp: timestamp,
      ownerName: formData.ownerName || '',
      platformNickname: formData.platformNickname || '',
      phone: formData.phone || '',
      address: formData.address || '',
      businessName: formData.businessName || '',
      businessNumber: formData.businessNumber || '',
      emailId: formData.emailId || '',
      emailDomain: formData.emailDomain || '',
      email: (formData.emailId || '') + '@' + (formData.emailDomain || ''),
      businessHoursStart: formData.businessHoursStart || '',
      businessHoursEnd: formData.businessHoursEnd || '',
      elevator: formData.elevator || '',
      buildingAccess: formData.buildingAccess || '',
      accessMethod: formData.accessMethod || '',
      parking: formData.parking || '',
      paymentMethod: formData.paymentMethod || '',
      accountNumber: formData.accountNumber || '',
      privacyConsent: formData.privacyConsent ? '동의' : '미동의',
      serviceConsent: formData.serviceConsent ? '동의' : '미동의',
      requestNotes: formData.requestNotes || ''
    };

    var webhookOptions = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(webhookPayload),
      muteHttpExceptions: true
    };

    // ═══════ Make 웹훅 전송 ═══════
    try {
      UrlFetchApp.fetch('https://hook.eu2.make.com/d6rjjszhes75r9wwhngqhhseevo8qttc', webhookOptions);
    } catch (webhookError) {
      Logger.log('Make 웹훅 오류: ' + webhookError.toString());
    }
    // ═══════ Make 웹훅 전송 끝 ═══════

    // ═══════ BBK 앱 웹훅 전송 ═══════
    try {
      UrlFetchApp.fetch(BBK_WEBHOOK_URL, webhookOptions);
    } catch (bbkError) {
      Logger.log('BBK 웹훅 오류: ' + bbkError.toString());
    }
    // ═══════ BBK 앱 웹훅 전송 끝 ═══════

    return { success: true, message: '신청서가 성공적으로 접수되었습니다!' };

  } catch (error) {
    Logger.log('submitForm Error: ' + error.toString());
    return { success: false, message: '오류: ' + error.toString() };
  }
}

// ============================================================
// 🧪 테스트 함수
// ============================================================
function testConnection() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ 스프레드시트 연결 성공: ' + ss.getName());
    var sheet = ss.getSheetByName('신청서');
    if (sheet) {
      Logger.log('✅ 신청서 시트 존재함');
    } else {
      Logger.log('ℹ️ 신청서 시트 없음 - 첫 제출 시 자동 생성됩니다');
    }
  } catch (e) {
    Logger.log('❌ 연결 실패: ' + e.toString());
  }
}

function testWebhook() {
  var testData = {
    timestamp: '2026-03-14 12:00:00',
    ownerName: '테스트 대표자',
    platformNickname: '숨고닉네임',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 123',
    businessName: '테스트식당',
    businessNumber: '123-45-67890',
    emailId: 'test',
    emailDomain: 'naver.com',
    email: 'test@naver.com',
    businessHoursStart: '09:00',
    businessHoursEnd: '22:00',
    elevator: '사용가능',
    buildingAccess: '신청불필요',
    accessMethod: '비밀번호 1234#',
    parking: '건물전용',
    paymentMethod: '현금',
    accountNumber: '국민은행 000-000-000000',
    privacyConsent: '동의',
    serviceConsent: '동의',
    requestNotes: '테스트 요청사항입니다'
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(testData),
    muteHttpExceptions: true
  };

  // Make 웹훅 테스트
  var makeRes = UrlFetchApp.fetch('https://hook.eu2.make.com/d6rjjszhes75r9wwhngqhhseevo8qttc', options);
  Logger.log('Make 응답: ' + makeRes.getResponseCode() + ' / ' + makeRes.getContentText());

  // BBK 앱 웹훅 테스트
  var bbkRes = UrlFetchApp.fetch(BBK_WEBHOOK_URL, options);
  Logger.log('BBK 응답: ' + bbkRes.getResponseCode() + ' / ' + bbkRes.getContentText());
}
