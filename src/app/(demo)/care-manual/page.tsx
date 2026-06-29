const MANUAL = [
  {
    section: '주방 케어',
    items: [
      { label: '후드 / 덕트', desc: '기름때 분해 약품으로 외부·내부 분리 세척' },
      { label: '가스레인지·간택기', desc: '버너·받침판 분리, 점화구 카본 제거' },
      { label: '튀김기·식기세척기', desc: '내부 약품 순환, 외부 오염 닦기' },
    ],
  },
  {
    section: '냉장·냉동 설비',
    items: [
      { label: '업소용 냉장고 (4구)', desc: '외부 손잡이·문 표면 / 상단 먼지 제거' },
      { label: '쇼케이스', desc: '유리·실리콘 라인 약품 청소' },
    ],
  },
  {
    section: '위생환경 설비',
    items: [
      { label: '주방 바닥', desc: '기름때·잔류 세제 제거, 트랩 약품 청소' },
      { label: '에어컨 (벽걸이형)', desc: '필터 분리 세척, 토출구 카본 제거' },
      { label: '화장실', desc: '변기·세면대·바닥 약품 살균' },
    ],
  },
]

export default function DemoCareManualPage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-text-primary">케어매뉴얼</h1>
      <p className="text-xs text-text-tertiary -mt-3">샘플 카페 강남점 · 케어 범위 및 작업 기준</p>

      <div className="flex flex-col gap-3">
        {MANUAL.map((section, i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
            <div className="px-4 py-3 bg-surface-sunken border-b border-border-subtle">
              <h2 className="text-sm font-semibold text-text-primary">{section.section}</h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {section.items.map((item, j) => (
                <div key={j} className="px-4 py-3 flex flex-col gap-1">
                  <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center mt-2">
        <p className="text-xs text-brand-700 leading-relaxed">
          위 케어매뉴얼은 미리보기 예시입니다.
          <br />
          실제 매장 맞춤 케어매뉴얼은 계약 후 제공됩니다.
        </p>
      </div>
    </div>
  )
}
