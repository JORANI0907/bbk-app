export const metadata = {
  title: '서비스 안내 | BBK 공간케어',
  description: '범빌드코리아 BBK 공간케어 서비스 안내 및 요금표',
}

const services = [
  {
    category: '1회성케어',
    desc: '단발성 전문 청소 서비스',
    items: [
      { name: '소형 (20평 이하)', price: '120,000원~' },
      { name: '중형 (21~40평)', price: '200,000원~' },
      { name: '대형 (41~60평)', price: '300,000원~' },
      { name: '특대형 (61평 이상)', price: '400,000원~' },
    ],
  },
  {
    category: '정기딥케어',
    desc: '정기 딥 클리닝 구독 서비스',
    items: [
      { name: '월 1회 기본형', price: '150,000원~/회' },
      { name: '월 2회 기본형', price: '270,000원~/회' },
    ],
  },
  {
    category: '정기엔드케어',
    desc: '정기 엔드 클리닝 구독 서비스',
    items: [
      { name: '기본형', price: '100,000원~/회' },
      { name: '확장형', price: '180,000원~/회' },
    ],
  },
]

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">서비스 안내</h1>
        <p className="text-white/60 text-sm mt-2">청결한 공간, 신뢰할 수 있는 서비스</p>
      </div>

      {/* 서비스 패키지 */}
      {services.map((svc) => (
        <div
          key={svc.category}
          className="rounded-2xl border border-white/15 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
        >
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-white font-bold text-base">{svc.category}</h2>
            <p className="text-white/50 text-xs mt-0.5">{svc.desc}</p>
          </div>
          <div className="divide-y divide-white/10">
            {svc.items.map((item) => (
              <div key={item.name} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-white/80 text-sm">{item.name}</span>
                <span className="text-sky-300 font-semibold text-sm">{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 안내 */}
      <div
        className="rounded-2xl border border-white/10 p-5"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)' }}
      >
        <p className="text-white/45 text-xs leading-relaxed">
          ※ 표기 금액은 기본 요금이며, 실제 금액은 현장 면적·오염도·서비스 옵션에 따라 달라질 수 있습니다.<br />
          ※ 모든 금액은 부가세(VAT 10%) 포함 기준입니다.<br />
          ※ 예약 및 상세 견적은 전화(031-759-4877) 또는 이메일로 문의해 주세요.
        </p>
      </div>

      {/* 회사 소개 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-base mb-2">범빌드코리아 (BBK Korea)</h2>
        <ul className="space-y-1.5 text-white/65 text-sm leading-normal">
          <li>• 사업자등록번호: 398-81-04260</li>
          <li>• 업종: 상업 공간 전문 청소 (주방후드/덕트/바닥/에어컨/식기세척기 등)</li>
          <li>• 운영 지역: 성남시 중심, 서울 수도권</li>
          <li>• 문의: 031-759-4877 | sunrise@bbkorea.co.kr</li>
        </ul>
      </div>
    </div>
  )
}
