export const metadata = {
  title: '개인정보처리방침 | 범빌드코리아',
}

const sections = [
  {
    title: '1. 수집하는 개인정보 항목',
    content: `[필수 항목]
• 성명, 휴대전화번호, 이메일 주소
• 서비스 현장 주소 (고객사)
• 로그인 정보 (이메일/카카오 계정)

[선택 항목]
• 회사명, 담당자명 (고객사 계정)

[자동 수집]
• 서비스 이용 기록, 접속 로그, 기기 정보`,
  },
  {
    title: '2. 개인정보 수집 목적',
    content: `• 회원 가입 및 본인 확인 (OTP, 카카오 로그인)
• 서비스 계약 체결 및 일정 관리
• 작업자 배정 및 현장 정보 제공
• SMS 알림 발송 (서비스 일정, 완료 안내)
• 고객 지원 및 분쟁 해결
• 서비스 품질 개선`,
  },
  {
    title: '3. 개인정보 보유 및 이용 기간',
    content: `회원 탈퇴 또는 서비스 계약 종료 시 즉시 삭제합니다.
단, 관계 법령에 따라 아래 기간 동안 보관합니다.

• 계약 또는 청약철회 기록: 5년 (전자상거래법)
• 대금 결제 및 재화 공급 기록: 5년 (전자상거래법)
• 소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)
• 접속 로그: 3개월 (통신비밀보호법)`,
  },
  {
    title: '4. 개인정보 제3자 제공',
    content: `회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.
다음의 경우에만 예외로 합니다.

• 이용자가 사전에 동의한 경우
• 법령에 의거하거나 수사기관의 요청이 있는 경우`,
  },
  {
    title: '5. 개인정보 처리 위탁',
    content: `서비스 제공을 위해 아래 업체에 처리를 위탁합니다.

• Supabase Inc. — 데이터 저장 및 관리
• ㈜솔라피 (Solapi) — SMS 발송
• 카카오 ㈜ — 카카오 로그인 인증
• ㈜포트원 — 결제 처리 (해당 시)

위탁 업체는 위탁 목적 이외의 용도로 개인정보를 이용하지 않습니다.`,
  },
  {
    title: '6. 이용자의 권리',
    content: `이용자는 언제든지 아래 권리를 행사할 수 있습니다.

• 개인정보 열람 요청
• 오류 정정 요청
• 삭제(회원 탈퇴) 요청
• 처리 정지 요청

요청 방법: 아래 연락처로 문의하시면 지체 없이 처리합니다.
이메일: sunrise@bbkorea.co.kr
전화: 031-759-4877`,
  },
  {
    title: '7. 개인정보 보호책임자',
    content: `성명: 조동환 (대표)
소속: 범빌드코리아
전화: 031-759-4877
이메일: sunrise@bbkorea.co.kr`,
  },
  {
    title: '8. 개인정보처리방침 변경',
    content: `본 방침은 법령 및 서비스 변경에 따라 개정될 수 있습니다.
변경 시 앱 내 공지사항을 통해 사전 안내합니다.`,
  },
]

export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">개인정보처리방침</h1>
        <p className="text-white/50 text-xs mt-2">시행일: 2026년 6월 27일</p>
      </div>

      {sections.map((sec) => (
        <div
          key={sec.title}
          className="rounded-2xl border border-white/15 p-5"
          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
        >
          <h2 className="text-white font-bold text-sm mb-2">{sec.title}</h2>
          <p className="text-white/65 text-sm leading-relaxed whitespace-pre-line">{sec.content}</p>
        </div>
      ))}

      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <p className="text-white/40 text-xs">문의: 031-759-4877 | sunrise@bbkorea.co.kr</p>
        <p className="text-white/40 text-xs mt-1">범빌드코리아 | 사업자등록번호: 398-81-04260</p>
        <p className="text-white/40 text-xs mt-1">경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
      </div>
    </div>
  )
}
