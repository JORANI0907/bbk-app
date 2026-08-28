import Link from 'next/link'

export default function KgAuditHomePage() {
  return (
    <div className="space-y-6">
      {/* 히어로 */}
      <section className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-6 text-white shadow-card">
        <p className="text-xs font-medium tracking-widest text-white/80 mb-2">BBK 공간케어</p>
        <h2 className="text-2xl font-black leading-tight mb-2">상업 시설 전문 청소 서비스</h2>
        <p className="text-sm text-white/90 leading-relaxed">
          음식점·카페·사무실·상업 빌딩을 대상으로 정기 구독 서비스와 1회성 청소 서비스를 제공합니다.
          주방 후드·덕트부터 화장실·공조·바닥까지 카테고리별로 원하는 항목을 선택하여 신청하실 수 있습니다.
        </p>
      </section>

      {/* 서비스 선택 */}
      <section>
        <h3 className="text-base font-bold text-text-primary mb-3">서비스 선택</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ServiceCard
            href="/kg-audit/subscribe"
            icon="🔁"
            title="정기 구독 서비스"
            desc="매달 정해진 일자에 방문하여 지속적으로 관리합니다. 카드 등록 후 매달 자동 결제."
            price="월 100,000원부터"
          />
          <ServiceCard
            href="/kg-audit/one-time"
            icon="✨"
            title="1회성 청소 서비스"
            desc="필요한 청소 항목만 골라 단발성으로 신청합니다. 8개 카테고리 30개 품목."
            price="건당 60,000원부터"
          />
        </div>
      </section>

      {/* 안내 */}
      <section className="grid gap-3 sm:grid-cols-2">
        <InfoCard href="/kg-audit/services" title="서비스 안내" desc="제공 중인 청소 서비스 카테고리와 요금을 확인하세요." />
        <InfoCard href="/kg-audit/refund"   title="환불 규정"   desc="서비스 취소·환불 정책을 확인하실 수 있습니다." />
      </section>

      {/* 테스트 계정 안내 - 작게 */}
      <section className="bg-surface-sunken rounded-xl px-4 py-3 border border-border-subtle">
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          현재 접속하신 계정은 <span className="font-semibold text-text-secondary">테스트 계정</span>입니다.
          결제 흐름 확인 목적으로 사용되며, 실제 서비스 신청 및 결제 승인은 발생하지 않습니다.
        </p>
      </section>
    </div>
  )
}

function ServiceCard({ href, icon, title, desc, price }: { href: string; icon: string; title: string; desc: string; price: string }) {
  return (
    <Link href={href} className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 hover:shadow-card hover:-translate-y-0.5 transition-all block">
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="text-base font-bold text-text-primary mb-1">{title}</h4>
      <p className="text-xs text-text-secondary leading-relaxed mb-3">{desc}</p>
      <p className="text-sm font-bold text-brand-600">{price}</p>
    </Link>
  )
}

function InfoCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="bg-surface rounded-xl border border-border-subtle p-4 hover:border-border-strong transition-all block">
      <h4 className="text-sm font-semibold text-text-primary mb-1">{title}</h4>
      <p className="text-xs text-text-secondary leading-relaxed">{desc}</p>
    </Link>
  )
}
