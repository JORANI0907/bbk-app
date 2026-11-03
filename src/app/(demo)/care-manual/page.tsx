import type { CareManualV2 } from '@/types/care-manual'
import { CareManualViewer } from '@/components/care-manual/CareManualViewer'

/** 데모용 샘플 — 구역(탭) → 작업 묶음 → 작업 항목 구조 (2026-11-03) */
const MANUAL: CareManualV2 = {
  version: 2,
  zones: [
    {
      id: 'z-kitchen', name: '주방', color: 'sky',
      groups: [
        {
          id: 'g-hood', title: '후드 · 덕트', summary: '기름때 분해 약품으로 외부·내부 분리 세척',
          items: [
            { id: 'i1', title: '후드 필터 분리 세척', instructions: '- 필터 3장 분리 후 전용 약품에 10분 담그기\n- 고압수로 헹군 뒤 완전 건조\n- 재조립 후 작동 확인', frequency: 'every', images: [] },
            { id: 'i2', title: '덕트 입구 기름 제거', instructions: '- 입구 30cm 구간 스크래퍼로 긁어낸 뒤 약품 분사\n- 기름받이 비우고 세척', caution: '전원 차단 후 작업', frequency: 'weekly', images: [] },
          ],
        },
        {
          id: 'g-cook', title: '조리 설비',
          items: [
            { id: 'i3', title: '가스레인지·간택기', instructions: '- 버너·받침판 분리\n- 점화구 카본 제거', frequency: 'every', images: [] },
            { id: 'i4', title: '튀김기·식기세척기', instructions: '- 내부 약품 순환\n- 외부 오염 닦기', frequency: 'weekly', images: [] },
          ],
        },
      ],
    },
    {
      id: 'z-cold', name: '냉장·냉동', color: 'mint',
      groups: [
        {
          id: 'g-fridge', title: '냉장 설비',
          items: [
            { id: 'i5', title: '업소용 냉장고 (4구)', instructions: '- 외부 손잡이·문 표면 닦기\n- 상단 먼지 제거', frequency: 'every', images: [] },
            { id: 'i6', title: '쇼케이스', instructions: '- 유리·실리콘 라인 약품 청소', caution: '유리 세정제는 실리콘에 닿지 않게', frequency: 'weekly', images: [] },
          ],
        },
      ],
    },
    {
      id: 'z-hygiene', name: '위생환경', color: 'apricot',
      groups: [
        {
          id: 'g-floor', title: '바닥 · 공조',
          items: [
            { id: 'i7', title: '주방 바닥', instructions: '- 기름때·잔류 세제 제거\n- 트랩 약품 청소', frequency: 'every', images: [] },
            { id: 'i8', title: '에어컨 (벽걸이형)', instructions: '- 필터 분리 세척\n- 토출구 카본 제거', frequency: 'monthly', images: [] },
            { id: 'i9', title: '화장실', instructions: '- 변기·세면대·바닥 약품 살균', frequency: 'every', images: [] },
          ],
        },
      ],
    },
  ],
}

export default function DemoCareManualPage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-text-primary">케어매뉴얼</h1>
      <p className="text-xs text-text-tertiary -mt-3">샘플 카페 강남점 · 케어 범위 및 작업 기준</p>

      <CareManualViewer manual={MANUAL} />

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
