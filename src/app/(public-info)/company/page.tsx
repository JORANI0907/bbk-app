export const metadata = {
  title: '회사정보 | BBK 공간케어',
}

const COMPANY_INFO = [
  { label: '상호명',        value: '범빌드코리아 주식회사' },
  { label: '대표자',        value: '조동환' },
  { label: '사업자등록번호', value: '398-81-04260' },
  { label: '전화',          value: '031-759-4877 / 010-5434-4877' },
  { label: '이메일',        value: 'sunrise@bbkorea.co.kr' },
  { label: '주소',          value: '경기도 성남시 중원구 둔촌대로268번길 22 201호' },
]

export default function CompanyPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">회사정보</h1>
        <p className="text-white/60 text-sm mt-2">범빌드코리아 주식회사</p>
      </div>

      <div
        className="rounded-2xl border border-white/15 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-bold text-base">기본 정보</h2>
        </div>
        <div className="divide-y divide-white/10">
          {COMPANY_INFO.map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4 px-5 py-4">
              <span className="text-xs text-white/40 w-24 shrink-0 pt-0.5">
                {label}
              </span>
              <span className="text-white/80 text-sm leading-relaxed">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-base mb-3">사업 소개</h2>
        <ul className="space-y-2 text-white/65 text-sm leading-relaxed">
          <li>• 업종: 상업 공간 전문 청소 (주방후드/덕트/바닥/에어컨/식기세척기 등)</li>
          <li>• 운영 지역: 성남시 중심, 서울 수도권</li>
          <li>• 서비스 모델: 1회성케어 · 정기딥케어 · 정기엔드케어</li>
        </ul>
      </div>

      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <p className="text-white/40 text-xs">문의: 031-759-4877 | sunrise@bbkorea.co.kr</p>
        <p className="text-white/40 text-xs mt-1">범빌드코리아 주식회사 | 사업자등록번호: 398-81-04260</p>
      </div>
    </div>
  )
}
