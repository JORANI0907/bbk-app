/**
 * "오늘" 강조 스타일 (Phase 27-K v3 — 활성화 톤).
 *
 * v2 → v3 변경 요약 (사용자 피드백: "구리다, 양각 없다, 약간 활성화 느낌"):
 * - 그라데이션 폐기 → **solid 컬러 + inset white 1px** 방식으로 통일
 *   반복 요소(리스트 행·캘린더 셀)에서 그라데이션은 시끄러움만 만든다.
 *   양각은 상단 흰 하이라이트(inset 0 1px 0 white) 만으로 충분히 표현됨.
 * - 3-4겹 shadow → **2겹으로 축소** (outer subtle + inset white)
 *   과한 shadow는 페이지에서 튀어나온 느낌이라 "활성화" 정서와 어긋난다.
 * - 컬러 톤 통일: 배경·border·shadow 모두 sky 계열로 → 한 색조로 묶여 "활성화" 느낌
 *
 * "활성화" 정의 (토스 관찰):
 * - solid 브랜드 톤 배경 (그라데이션 X)
 * - 얇은 컬러 border/ring (활성 상태 표시)
 * - 상단 1px inset white — 볼록한 물체 착시
 * - 아주 얇은 tint shadow — "선택된" 느낌 (lift 는 미묘하게)
 *
 * 사용 위치:
 * - 리스트 행(배정관리·고객관리): TODAY_ROW_* 3종 조합
 * - 캘린더 셀(배정관리·고객관리): TODAY_CELL_* 2종
 * - 날짜 원: TODAY_CIRCLE
 * - "오늘" 텍스트 배지: TODAY_BADGE
 *
 * 참고 문서: docs/UI_TODAY_HIGHLIGHT.md
 */

// ─── 리스트 행 ────────────────────────────────────────────────
// 좌측 4px sky-500 accent + solid sky-50 배경 + 상단 흰 하이라이트 (양각).
export const TODAY_ROW_BORDER = 'border-l-sky-500'
export const TODAY_ROW_BG = 'bg-sky-50'
export const TODAY_ROW_SHADOW =
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'

// ─── 캘린더 셀 ────────────────────────────────────────────────
// solid sky-50 배경 + 안쪽 sky ring(격자와 겹침 방지) + 상단 흰 하이라이트.
export const TODAY_CELL_BG = 'bg-sky-50'
export const TODAY_CELL_SHADOW =
  'shadow-[inset_0_0_0_1px_rgba(14,165,233,0.30),inset_0_1px_0_rgba(255,255,255,0.7)]'

// ─── 캘린더 날짜 원 ───────────────────────────────────────────
// solid sky-500 + 흰 링(배경 분리) + 상단 흰 하이라이트 + 얇은 tint 그림자.
export const TODAY_CIRCLE =
  'bg-sky-500 text-white font-bold ' +
  'shadow-[0_2px_4px_rgba(14,165,233,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] ' +
  'ring-2 ring-white'

// ─── "오늘" 텍스트 배지 ───────────────────────────────────────
// 원과 동일 방식 (solid + inset white + 얇은 tint shadow). 튀지 않고 활성화 느낌.
export const TODAY_BADGE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' +
  'bg-sky-500 text-white ' +
  'shadow-[0_1px_3px_rgba(14,165,233,0.40),inset_0_1px_0_rgba(255,255,255,0.35)] ' +
  'ring-1 ring-white/60'
