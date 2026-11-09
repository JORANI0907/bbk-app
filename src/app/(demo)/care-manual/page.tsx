import type { CareManualV2 } from '@/types/care-manual'
import type { CareCheck } from '@/lib/care-manual-status'
import { CareManualPortal } from '@/components/care-manual/CareManualPortal'

/** 데모 점검 날짜가 "지금" 기준이어야 초록·노랑이 의도대로 보인다 — 빌드 시점에 굳히지 않는다 */
export const dynamic = 'force-dynamic'

/**
 * 데모용 샘플 — 구역(탭) → 작업 묶음 → 작업 항목 구조 (2026-11-03)
 * 2026-11-08: 공간 보기(층 · 임시 360 사진 · 표시 · 점검 기록) 추가. 사진은 실제 촬영본이 오면 교체.
 */
const PANO = (name: string) => ({ image_url: `/demo/pano/${name}.jpg`, thumb_url: `/demo/pano/${name}_thumb.jpg` })
// 임시 사진의 가짜 설비 위치: yaw 0(정면)·+90°·180°·-90° 네 방향, 높이는 눈높이 조금 아래
const Y0 = 0, Y90 = Math.PI / 2, Y180 = Math.PI, Y270 = -Math.PI / 2, P = -0.3

/** 도면 분석 결과 예시 — 실제로는 [도면 분석] 버튼이 만들어 준다. 좌표는 0~1 비율 */
const R = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const FLOOR_PLANS: CareManualV2['floor_plans'] = [
  { id: 'fp1', floor: 1, aspect: 1.6, rooms: [
    { id: 'r-kitchen', name: '주방', kind: 'room', polygon: R(0, 0, 0.42, 0.62), zone_id: 'z-kitchen' },
    { id: 'r-cold', name: '냉장·냉동', kind: 'room', polygon: R(0, 0.62, 0.42, 0.38), zone_id: 'z-cold' },
    { id: 'r-hall', name: '홀', kind: 'corridor', polygon: R(0.42, 0, 0.46, 1) },
    { id: 'r-core1', name: '계단실', kind: 'core', polygon: R(0.88, 0, 0.12, 1) },
  ] },
  { id: 'fp2', floor: 2, aspect: 1.6, rooms: [
    { id: 'r-hyg', name: '위생환경', kind: 'room', polygon: R(0, 0.55, 0.35, 0.45), zone_id: 'z-hygiene' },
    { id: 'r-seat', name: '2층 좌석', kind: 'corridor', polygon: R(0, 0, 0.88, 0.55) },
    { id: 'r-store', name: '창고', kind: 'room', polygon: R(0.35, 0.55, 0.53, 0.45) },
    { id: 'r-core2', name: '계단실', kind: 'core', polygon: R(0.88, 0, 0.12, 1) },
  ] },
]

const MANUAL: CareManualV2 = {
  version: 2,
  floor_plans: FLOOR_PLANS,
  zones: [
    {
      id: 'z-kitchen', name: '주방', color: 'sky', space: { floor: 1 },
      panoramas: [{
        // 평면 사진(기본) — 휴대폰으로 찍은 일반 사진. 표시 좌표는 사진 위 비율(0~1)
        id: 'p-kitchen-flat', title: '후드 앞 (평면)', kind: 'flat', image_url: '/demo/pano/kitchen_flat.jpg', thumb_url: '/demo/pano/kitchen_flat_thumb.jpg',
        markers: [
          { id: 'f1', item_id: 'i1', type: 'point', x: 0.5, y: 0.28, note: '필터 3장 — 왼쪽 1장 변형' },
          { id: 'f2', item_id: 'i2', type: 'point', x: 0.5, y: 0.05 },
          { id: 'f3', item_id: 'i3', type: 'polygon', points: [[0.26, 0.47], [0.74, 0.47], [0.74, 0.68], [0.26, 0.68]] },
        ],
      }, {
        id: 'p-kitchen', title: '주방 가운데 (360)', ...PANO('kitchen'),
        markers: [
          { id: 'm1', item_id: 'i1', type: 'point', yaw: Y0, pitch: P, note: '필터 3장 중 왼쪽 1장이 변형 — 교체 견적 안내 예정' },
          { id: 'm2', item_id: 'i2', type: 'point', yaw: Y0 + 0.28, pitch: P + 0.25 },
          { id: 'm3', item_id: 'i3', type: 'point', yaw: Y90, pitch: P },
          { id: 'm4', item_id: 'i4', type: 'point', yaw: Y180, pitch: P, note: '튀김기 하부 기름받이는 매회 비움' },
          { id: 'm7', item_id: 'i7', type: 'polygon', points: [[-0.9, -0.55], [0.9, -0.55], [1.2, -1.1], [-1.2, -1.1]], note: '트랩 주변 미끄럼 주의 구간' },
        ],
      }],
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
        {
          id: 'g-kfloor', title: '바닥',
          items: [
            { id: 'i7', title: '주방 바닥·트랩', instructions: '- 기름때·잔류 세제 제거\n- 트랩 약품 청소', frequency: 'every', images: [] },
          ],
        },
      ],
    },
    {
      id: 'z-cold', name: '냉장·냉동', color: 'mint', space: { floor: 1 },
      panoramas: [{
        id: 'p-cold', title: '냉장고 앞', ...PANO('cold'),
        markers: [
          { id: 'm5', item_id: 'i5', type: 'point', yaw: Y0, pitch: P },
          { id: 'm6', item_id: 'i6', type: 'point', yaw: Y90, pitch: P, note: '유리 세정제는 실리콘에 닿지 않게' },
        ],
      }],
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
      id: 'z-hygiene', name: '위생환경', color: 'apricot', space: { floor: 2 },
      panoramas: [{
        id: 'p-hygiene', title: '화장실 입구', ...PANO('hygiene'),
        markers: [
          { id: 'm8', item_id: 'i8', type: 'point', yaw: Y0, pitch: P + 0.15 },
          { id: 'm9a', item_id: 'i9', type: 'point', yaw: Y90, pitch: P },
          { id: 'm9b', item_id: 'i9', type: 'point', yaw: Y180, pitch: P },
          { id: 'm10', item_id: 'i10', type: 'point', yaw: Y270, pitch: P - 0.2 },
        ],
      }],
      groups: [
        {
          id: 'g-air', title: '공조',
          items: [
            { id: 'i8', title: '에어컨 (벽걸이형)', instructions: '- 필터 분리 세척\n- 토출구 카본 제거', frequency: 'monthly', images: [] },
          ],
        },
        {
          id: 'g-toilet', title: '화장실',
          items: [
            { id: 'i9', title: '세면대·변기 살균', instructions: '- 변기·세면대·바닥 약품 살균', frequency: 'every', images: [] },
            { id: 'i10', title: '바닥 트랩', instructions: '- 트랩 덮개 분리 후 머리카락·이물 제거\n- 악취 차단제 투입', frequency: 'weekly', images: [] },
          ],
        },
      ],
    },
  ],
}

/** 데모 점검 기록 — 초록·노랑·빨강이 모두 보이도록 날짜를 섞는다 */
function demoChecks(): CareCheck[] {
  const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const mk = (id: string, item_id: string, zone_id: string, status: 'ok' | 'issue', days: number, memo: string | null = null): CareCheck =>
    ({ id, customer_id: 'demo', item_id, zone_id, status, memo, photo_url: null, worker_name: '김현장', checked_at: ago(days) })
  return [
    mk('c1', 'i1', 'z-kitchen', 'issue', 1, '왼쪽 필터 1장 변형 확인, 교체 필요'),
    mk('c2', 'i2', 'z-kitchen', 'ok', 2),
    mk('c3', 'i3', 'z-kitchen', 'ok', 2),
    // i4 는 기록 없음 → 노랑(점검 확인 필요)
    mk('c7', 'i7', 'z-kitchen', 'ok', 2),
    mk('c5', 'i5', 'z-cold', 'ok', 2),
    mk('c6', 'i6', 'z-cold', 'ok', 12), // 주 1회인데 12일 → 노랑
    mk('c8', 'i8', 'z-hygiene', 'ok', 20),
    mk('c9', 'i9', 'z-hygiene', 'ok', 2),
    mk('c10', 'i10', 'z-hygiene', 'ok', 3),
  ]
}

export default function DemoCareManualPage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-text-primary">케어매뉴얼</h1>
      <p className="text-xs text-text-tertiary -mt-3">샘플 카페 강남점 · 케어 범위 및 작업 기준</p>

      <CareManualPortal manual={MANUAL} initialChecks={demoChecks()} />

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center mt-2">
        <p className="text-xs text-brand-700 leading-relaxed">
          위 케어매뉴얼은 미리보기 예시입니다. 360 사진은 임시 이미지입니다.
          <br />
          실제 매장 맞춤 케어매뉴얼은 계약 후 제공됩니다.
        </p>
      </div>
    </div>
  )
}
