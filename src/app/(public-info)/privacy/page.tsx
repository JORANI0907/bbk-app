export const metadata = {
  title: '개인정보처리방침 | BBK 공간케어',
}

const sections = [
  {
    title: '1. 수집하는 개인정보 항목',
    content: '회사는 서비스 제공을 위해 다음 항목을 수집합니다.\n\n[필수 항목]\n• 성명, 휴대전화번호\n• 서비스 현장 주소\n• 결제 정보 (카드번호는 PG사에서 직접 관리, 회사 미보유)\n\n[자동 수집]\n• 서비스 이용 기록, 접속 로그',
  },
  {
    title: '2. 개인정보 수집 목적',
    content: '• 서비스 계약 체결 및 이행\n• 서비스 일정 안내 및 고객 지원\n• 결제 처리 및 세금계산서 발행\n• 서비스 품질 개선 및 분쟁 해결',
  },
  {
    title: '3. 개인정보 보유 및 이용 기간',
    content: '서비스 계약 종료 후 5년간 보유합니다. 단, 관계 법령에 따라 다음 기간 동안 보관합니다.\n\n• 계약 또는 청약철회 기록: 5년 (전자상거래법)\n• 대금 결제 및 재화 공급 기록: 5년 (전자상거래법)\n• 소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)',
  },
  {
    title: '4. 개인정보 제3자 제공',
    content: '회사는 원칙적으로 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우 예외로 합니다.\n\n• 이용자가 사전에 동의한 경우\n• 법령에 의거하거나 수사기관의 요구가 있는 경우\n• 결제 처리를 위한 PG사(포트원, KG이니시스) 연동',
  },
  {
    title: '5. 개인정보 처리 위탁',
    content: '회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.\n\n• 수탁업체: ㈜포트원 (결제 처리)\n• 수탁업체: ㈜KG이니시스 (결제 처리)\n• 수탁업체: Supabase Inc. (데이터 저장)\n• 수탁업체: ㈜솔라피 (SMS 발송)',
  },
  {
    title: '6. 이용자의 권리',
    content: '이용자는 언제든지 다음 권리를 행사할 수 있습니다.\n\n• 개인정보 열람 요청\n• 오류 수정 요청\n• 삭제 요청\n• 처리 정지 요청\n\n요청은 031-759-4877 또는 sunrise@bbkorea.co.kr로 연락하시기 바랍니다.',
  },
  {
    title: '7. 개인정보 보호책임자',
    content: '성명: 범빌드코리아 대표\n연락처: 031-759-4877\n이메일: sunrise@bbkorea.co.kr',
  },
]

export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">개인정보처리방침</h1>
        <p className="text-white/50 text-xs mt-2">시행일: 2025년 1월 1일</p>
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
        <p className="text-white/40 text-xs mt-1">범빌드코리아 | 사업자등록번호: 298-78-00455</p>
      </div>
    </div>
  )
}
