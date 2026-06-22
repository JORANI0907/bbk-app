export const metadata = {
  title: '이용약관 | BBK 공간케어',
}

const sections = [
  {
    title: '제1조 (목적)',
    content: '본 약관은 범빌드코리아(이하 "회사")가 제공하는 BBK 공간케어 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.',
  },
  {
    title: '제2조 (서비스 이용)',
    content: '서비스는 회사와 서비스 이용 계약을 체결한 고객(이하 "이용자")에게 제공됩니다. 이용자는 본 약관에 동의함으로써 서비스를 이용할 수 있습니다.',
  },
  {
    title: '제3조 (이용자 의무)',
    content: '이용자는 서비스 이용 시 다음 사항을 준수해야 합니다.\n① 정확한 서비스 현장 정보 제공\n② 서비스 일정 변경 시 48시간 전 사전 통보\n③ 작업자의 안전한 작업 환경 제공\n④ 서비스 대금의 약정 기한 내 납부',
  },
  {
    title: '제4조 (서비스 제공 및 변경)',
    content: '회사는 계약된 서비스를 성실히 제공합니다. 천재지변, 작업자 안전 위협 등 불가피한 사유 발생 시 서비스 일정을 조율할 수 있으며, 이 경우 이용자에게 사전 통보합니다.',
  },
  {
    title: '제5조 (책임 제한)',
    content: '회사는 이용자가 제공한 부정확한 정보로 인해 발생한 손해에 대해 책임을 지지 않습니다. 또한 천재지변, 불가항력적 사유로 인한 서비스 지연 및 중단에 대해서는 책임이 면제됩니다.',
  },
  {
    title: '제6조 (분쟁 해결)',
    content: '서비스 이용과 관련하여 분쟁이 발생한 경우, 회사와 이용자는 성실히 협의하여 해결합니다. 협의가 이루어지지 않을 경우 관할 법원은 회사 소재지를 관할하는 법원으로 합니다.',
  },
  {
    title: '제7조 (약관 변경)',
    content: '회사는 약관을 변경할 경우 변경 사항을 서비스 화면에 7일 이전에 공지합니다. 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 계약을 해지할 수 있습니다.',
  },
]

export default function TermsPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">이용약관</h1>
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
        <p className="text-white/40 text-xs mt-1">범빌드코리아 | 사업자등록번호: 398-81-04260</p>
      </div>
    </div>
  )
}
