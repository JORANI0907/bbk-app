# "오늘" 강조 UI 리파인먼트 (Phase 27-K)

> 리스트·캘린더에서 "오늘"을 표시하는 방식을 토스(Toss) 스타일로 재설계한 기록.
> 참고 소스: `src/lib/ui/today-styles.ts`

---

## 1. 배경 — 왜 바꿨나

Phase 13 에서 도입한 오늘 강조는 아래와 같았다.

```tsx
// 리스트 행
className={`... ${isToday ? 'ring-2 ring-inset ring-sky-400' : ''}`}
// 캘린더 셀
className={`... ${isToday ? 'bg-brand-50' : ''}`}
// 날짜 원
className={`... ${isToday ? 'bg-brand-600 text-white' : ''}`}
// "오늘" 뱃지
<span className="text-xs font-bold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full">오늘</span>
```

**드러난 문제**
1. `ring-2 ring-inset` 이 셀 경계·좌측 4px border 와 겹쳐 계단(zigzag) 효과 발생 — 스크린 픽셀 그리드에 붙어 "샤프하고 투박"하게 보임.
2. `bg-brand-50` 는 채도가 있어 여러 행이 나열되면 배경이 시끄러움. 데이터가 가려짐.
3. `bg-brand-100` 뱃지는 flat 하고 밋밋함 — 다른 상태 뱃지(회색 뱃지들)와 시각 위계 차이가 부족.

사용자 피드백:
> "더 고급스러운 느낌으로 구현해줘. 음영·양각·그라데이션 살려서. 투박하지 않고 마치 '토스' 기업 UI 처럼 깔끔하고 순정 느낌이면서 중요하고 간단한 부분에 음영 포인트 넣는거지."

---

## 2. 검토한 옵션

| # | 방향 | 채택 여부 | 사유 |
|---|------|-----------|------|
| A | ring 색만 sky-300 정도로 낮춘다 | ✗ | 여전히 계단 효과·강조 방식 자체가 투박 |
| B | 배경만 진한 파스텔로 바꾼다 | ✗ | 여러 행에 반복되면 배경이 시끄럽고 데이터 가독성 손해 |
| C | 좌측 accent bar + 좌→우 페이드 그라데이션 + tint shadow | **✓** | 링 제거로 계단 사라짐, 좌측에서 빛이 들어오는 자연스러운 강조, 소음 최소화 |
| D | box-shadow만 강하게 (glow) | ✗ | 카드/모달 계열이 아닌 리스트 행에서는 부자연스러움 |

**채택 (C)** — 토스 UI 관찰에서 나온 3요소:
1. **매우 옅은 그라데이션** — `from-sky-50/60 via-white` 처럼 채도 낮음, 데이터 가독성 유지
2. **tint 컬러 shadow** — 검은 그림자 대신 브랜드 톤 rgba (예: `rgba(14,165,233,0.06)`)
3. **inset white 하이라이트** — 원·배지 상단에 `inset 0 1px 0 rgba(255,255,255,0.25)` 을 넣어 양각 착시

---

## 2.5 v2 강화 (양각·음영·컬러 임계값 올리기)

v1 배포 후 사용자 피드백:
> "더 깔끔하고 포인트있게 음영과 양각으로 표현해줘."

v1 은 tint shadow alpha 를 0.06 근처로 매우 옅게 뒀는데, 이는 "미묘함" 구간이라 존재감이 떨어졌다. **포인트 임계값(alpha 0.15~0.20)** 으로 올리고, 양각을 명시적으로 만들기 위해 **3-shadow 스택**을 도입.

| 축 | v1 | v2 |
|---|----|----|
| 그라데이션 시작 채도 | `sky-50/60` | **`sky-100/70`** (배경 존재감 확보) |
| 원·배지 그라데이션 stop | 2-stop | **3-stop** (`from-sky-400 via-sky-500 to-sky-600` — 구체감) |
| tint shadow alpha | 0.06~0.10 | **0.15~0.20** (포인트 임계값) |
| shadow blur | 12px | **20px** (부드러운 확산) |
| 양각 표현 | inset white top 1층 | **inset white top + inset dark bottom + outer drop 3층** |
| ring 컬러 | `white/40` | **`sky-300/50`** (컬러 링으로 액센트) |

**핵심 발견 — 양각을 만드는 CSS 공식**
```
inset 0  1px 0 rgba(255,255,255,0.5)   ← 상단 하이라이트 (빛)
inset 0 -1px 0 rgba(15,23,42,0.12)     ← 하단 미세 그늘
0    1px 2px rgba(14,165,233,0.30)     ← 근접 그림자 (붙어 있는 느낌)
0    4px 10px rgba(14,165,233,0.45)    ← 원거리 확산 그림자 (부양)
```
세 층(하이라이트·그늘·부양) 이 모두 있을 때만 뇌가 "튀어나온 물체" 로 인식. 하나라도 빠지면 flat 하게 보인다.

**포인트 임계값 (실측)**
- alpha 0.06~0.10 → 미묘함 (v1)
- **alpha 0.15~0.20 → 포인트** (v2 채택)
- alpha 0.30+ → 무거움 (분위기 깨짐)

---

## 3. 최종 설계 (토큰, v2)

`src/lib/ui/today-styles.ts` 에 상수로 뽑아 단일 진리원 확보.

### 리스트 행 (3종 조합)
```ts
TODAY_ROW_BORDER = 'border-l-sky-500'
TODAY_ROW_BG     = 'bg-gradient-to-r from-sky-100/70 via-sky-50/30 to-white'
TODAY_ROW_SHADOW = [
  'inset 0  1px 0 rgba(255,255,255,0.6)',   // 상단 하이라이트
  'inset 0 -1px 0 rgba(15,23,42,0.05)',     // 하단 미세 그늘
  '0    2px 4px rgba(15,23,42,0.05)',       // 근접 그림자
  '0    8px 20px rgba(14,165,233,0.15)',    // sky tint 원거리 확산
]
```

- **왜 좌측 border 만?** — `<tr>` 에 `position: relative` 를 걸어 `::before` accent bar 를 만드는 방식은 브라우저 호환성 문제가 있음(테이블 stacking context). 기존 `border-l-4 ${progressBorder}` 구조를 활용해 오늘일 땐 색만 sky-500 으로 override 하는 게 안전.
- **shadow 는 2겹** — 첫 겹은 중립 회색으로 "면 위에 뜬" 느낌, 두 번째 겹은 sky tint 로 "이 행이 오늘"이라는 색채 신호.

### 캘린더 셀 (2종 조합)
```ts
TODAY_CELL_BG     = 'bg-gradient-to-br from-sky-100/70 via-sky-50/30 to-white'
TODAY_CELL_SHADOW = [
  'inset 0 0 0 1px rgba(14,165,233,0.20)', // 안쪽 sky 링 (border 대체, 격자와 겹침 방지)
  'inset 0 1px 0 rgba(255,255,255,0.6)',   // 상단 하이라이트
  '0    2px 6px rgba(14,165,233,0.12)',    // tint 확산
]
```

- **inset 1px shadow** — border 대신 사용해 격자선과 겹치지 않으면서 셀 안쪽에 매우 얇은 sky 라인이 생김. 계단 효과 방지.

### 캘린더 날짜 원
```ts
TODAY_CIRCLE =
  // 3-stop 그라데이션으로 구체감
  'bg-gradient-to-br from-sky-400 via-sky-500 to-sky-600 text-white ' +
  // 양각 4-shadow: 근접+원거리+상단 하이라이트+하단 그늘
  'shadow-[0 1px 2px rgba(14,165,233,0.30), 0 4px 10px rgba(14,165,233,0.45),' +
  'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(15,23,42,0.12)] ' +
  'ring-1 ring-sky-300/50'
```

- **`from-sky-500 to-sky-600` 그라데이션** — 단색 대신 위→아래 미세한 어둠으로 구체감.
- **`inset 0 1px 0 rgba(255,255,255,0.25)`** — 원 상단에 얇은 흰 하이라이트, 양각 착시.
- **`ring-1 ring-white/40`** — 원 주변에 옅은 흰 링, 배경 대비 원이 살짝 떠 있는 느낌.

### "오늘" 텍스트 배지
```ts
TODAY_BADGE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' +
  // 원과 같은 3-stop 그라데이션 (방향은 위→아래)
  'bg-gradient-to-b from-sky-400 via-sky-500 to-sky-600 text-white ' +
  // 양각 4-shadow — 원과 동일
  'shadow-[0 1px 2px rgba(14,165,233,0.30), 0 3px 8px rgba(14,165,233,0.40),' +
  'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(15,23,42,0.12)] ' +
  'ring-1 ring-sky-300/50'
```

원과 동일 공식(3-stop 그라데이션 + 양각 4-shadow + sky ring). 다른 상태 뱃지 대비 확실히 앞으로 튀어나온 느낌.

---

## 4. 적용 위치

| 파일 | 라인 | 대상 |
|------|------|------|
| `src/app/admin/schedule/page.tsx` | 397, 401 | 배정관리 캘린더 셀·날짜 원 |
| `src/app/admin/schedule/page.tsx` | 1470-1500 | 배정관리 리스트 행 (accent border + gradient + shadow), "오늘" 뱃지 |
| `src/components/admin/customers/CustomersManagementView.tsx` | 2060 | 고객관리 리스트 행 (ring → gradient + shadow) |
| `src/components/admin/customers/CustomersCalendarGrid.tsx` | 337, 342 | 고객관리 캘린더 셀·날짜 원 |

**우선순위 규칙 (배정관리 리스트):**
`isSelected > isCompleted > isToday > 유형 배경(default)`
- 오늘이지만 선택 상태이면 브랜드 링 유지 (선택 강조가 더 강함)
- 오늘이지만 완료 상태이면 회색톤 유지 (완료 우선)

**우선순위 규칙 (고객관리 리스트):**
`isToday > progressBorder / paymentBg (오늘 스타일이 좌측 border·배경 override)`
- 단, `isSelected`/`isChecked` 링은 유지 (사용자 액션이 최상위)

---

## 5. 사용 가이드 (신규 추가 시)

새 화면에서 "오늘" 강조가 필요하면:

```tsx
import {
  TODAY_ROW_BORDER, TODAY_ROW_BG, TODAY_ROW_SHADOW,
  TODAY_CELL_BG, TODAY_CELL_SHADOW,
  TODAY_CIRCLE, TODAY_BADGE,
} from '@/lib/ui/today-styles'

// 리스트 행
<tr className={`border-l-4 ${isToday ? TODAY_ROW_BORDER : progressBorder} ${isToday ? `${TODAY_ROW_BG} ${TODAY_ROW_SHADOW}` : ''}`}>
  ...
</tr>

// 캘린더 셀
<div className={`... ${isToday ? `${TODAY_CELL_BG} ${TODAY_CELL_SHADOW}` : ''}`}>
  <div className={isToday ? TODAY_CIRCLE : 'text-text-primary'}>
    {day}
  </div>
</div>

// "오늘" 텍스트 뱃지
{isToday && <span className={TODAY_BADGE}>오늘</span>}
```

**주의사항**
- 상수를 **인라인 확장**하지 마라. 톤 어긋남 방지를 위해 반드시 import 해서 사용.
- 새 오늘 강조 위치를 추가하면 이 문서의 **§4 적용 위치** 표에 라인을 추가.
- 만약 sky 계열이 아닌 다른 액센트가 필요한 상황이 생기면(예: "긴급"), 별도 파일(`urgent-styles.ts`)로 뽑고 이 문서와 유사한 형식으로 정리.

---

## 6. 확장 원칙 — 다른 강조 축을 만들 때

이 리파인먼트에서 정착시킨 **"고급 강조"의 공식**은 다음과 같다.

```
얇은 accent (border-l-* / ring-1)
+ 옅은 방향성 그라데이션 (from-{tint}-50/60 via-white)
+ 2겹 shadow (중립 회색 얇게 + tint 컬러 살짝)
+ (원·배지의 경우) inset white 하이라이트로 양각 착시
```

**금지 사항**
- ❌ `ring-2` 이상 두께 — 계단 효과 유발
- ❌ 채도 진한 배경 단색(`bg-{tint}-200` 이상 solid) — 여러 행 나열 시 배경 시끄러움
- ❌ 검은 shadow (rgba(0,0,0,0.15) 이상) — 페이지 톤과 조화 깨짐
- ❌ 그라데이션의 채도 시작점 > 80/100 opacity — 데이터 가독성 저하

**권장 (v2 기준)**
- ✓ **배경 요소(리스트 행/셀)** — tint shadow alpha `0.10~0.15`, 그라데이션 시작 `sky-100/70` 정도
- ✓ **강조 요소(원·배지)** — tint shadow alpha `0.30~0.45`, 3-stop 그라데이션(from-{c}-400 via-{c}-500 to-{c}-600)
- ✓ 그라데이션 방향: 배경은 좌→우 또는 대각선(정보 흐름), 원·배지는 위→아래(구체감)
- ✓ 양각 만들 땐 반드시 **inset white top + inset dark bottom + outer drop** 3층 모두 사용
- ✓ ring 은 1px 컬러 링(`ring-{c}-300/50`) — 배경과 대비하는 얇은 액센트

---

## 7. 참고

- 관련 커밋: Phase 27-K
- 이전 강조 방식: `git log --all --oneline -- src/lib/ui/today-styles.ts` 로 원 상태 확인 가능
- 디자인 시스템 상위 문서: `docs/UI_REFINEMENT_PLAN.md`
- 공통 원칙: `apps/CLAUDE.md` — "공통 디자인 시스템 규칙"
