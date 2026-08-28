import { SUBSCRIPTION_PRODUCTS, ONE_TIME_PRODUCTS, groupByCategory } from '@/lib/kg-audit/products'

export default function KgAuditServicesPage() {
  const oneTimeGroups = groupByCategory(ONE_TIME_PRODUCTS)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-2">서비스 안내</h2>
        <p className="text-sm text-text-secondary">
          BBK 공간케어의 정기 구독 서비스와 1회성 청소 서비스 카테고리를 안내합니다.
        </p>
      </div>

      {/* 정기 서비스 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <h3 className="text-base font-bold text-text-primary mb-3">정기 서비스 (월 자동 결제)</h3>
        <p className="text-xs text-text-secondary mb-4 leading-relaxed">
          매달 정해진 일자에 방문하여 정기적으로 청소를 진행합니다. 첫 결제 시 카드를 등록하시면 이후 자동으로 청구됩니다.
        </p>
        <div className="grid gap-2">
          {SUBSCRIPTION_PRODUCTS.map((p) => (
            <div key={p.code} className="flex items-center justify-between border border-border-subtle rounded-lg px-4 py-3">
              <div>
                <p className="text-xs text-text-tertiary">{p.category}</p>
                <p className="text-sm font-semibold text-text-primary mt-0.5">{p.label}</p>
              </div>
              <p className="text-sm font-bold text-brand-600">{p.price.toLocaleString('ko-KR')}원 / {p.unit}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 1회성 서비스 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <h3 className="text-base font-bold text-text-primary mb-3">1회성 서비스 (일반 결제)</h3>
        <p className="text-xs text-text-secondary mb-4 leading-relaxed">
          필요한 청소만 단발성으로 진행합니다. 아래 8개 카테고리에 걸쳐 총 30개 세부 품목이 제공됩니다.
        </p>
        <div className="space-y-4">
          {oneTimeGroups.map((group) => (
            <div key={group.category}>
              <p className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                <span>{group.icon}</span>
                <span>{group.category}</span>
                <span className="text-xs font-normal text-text-tertiary">({group.items.length}개 품목)</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {group.items.map((p) => (
                  <div key={p.code} className="text-text-secondary leading-tight">
                    · {p.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
