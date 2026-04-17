# BBK 썸네일 생성 규칙 (필수 준수)
# Claude Code Instruction File
# 최종 업데이트: 2026-04-18

---

## 0. 적용 범위

자동·수동 구분 없이 **모든 썸네일 생성은 본 규칙을 반드시 따른다.**

| 경로 | 호출 체인 |
|------|-----------|
| 자동 (Make cron) | orchestrator.js → `src/thumbnail-generator.js` → **`generate_thumbnail.py`** |
| 수동 테스트 | `scripts/test-thumbnail.js` → `src/thumbnail-generator.js` → **`generate_thumbnail.py`** |
| 수동 재생성 | `scripts/retry-photo.js` → `src/thumbnail-generator.js` → **`generate_thumbnail.py`** |
| bbk-app API | `/api/marketing/generate-thumbnail` → VPS → **`generate_thumbnail.py`** |

**단일 진실 소스**: `scripts/marketing/generate_thumbnail.py`

---

## 1. 텍스트 합성 규칙 (절대 금지 사항)

- ❌ **Imagen 프롬프트에 한글/영문 텍스트 내용을 포함하지 않는다.**
  - AI가 렌더링한 한글은 깨짐 (예: "잠실" → "복한")
- ❌ Pillow ImageDraw 픽셀 합성 방식 사용 금지 (구버전)
- ❌ Canvas(`@napi-rs/canvas`) 단순 템플릿 합성 사용 금지 (구버전)

✅ **허용되는 유일한 텍스트 합성 방식: HTML + Playwright 크로미움 헤드리스 렌더링**

```
Imagen 4       → 배경 PNG (텍스트 없음)
Nano Banana    → 캐릭터 PNG (텍스트 없음, 이미지-투-이미지 편집)
HTML/CSS       → 텍스트·레이아웃·태그·브랜드 바
Playwright     → 1080×1080 PNG 스크린샷
```

---

## 2. 배경 생성 (Imagen 4)

```
Model     : imagen-4.0-generate-001
Endpoint  : https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict
Auth      : GEMINI_API_KEY (.env.local)
Aspect    : 1:1 (1080×1080 고정)
Fallback  : Pexels (PEXELS_API_KEY) → 실제 사진
```

품목별 검색 키워드는 `ITEM_SEARCH_QUERIES`에 정의. 입력 item에 "청소" 접미사가 있으면 호출 측에서 제거 후 전달.

---

## 3. 캐릭터 생성 (Nano Banana image-to-image)

**필수 사용 기술**: Gemini 2.5 Flash Image (Nano Banana) 이미지-투-이미지 편집

```
Model 우선순위  : gemini-2.5-flash-image → gemini-2.5-flash-image-preview
방식           : 로컬 포트폴리오 PNG을 레퍼런스로 전달 + 포즈/의상 프롬프트
반드시 유지     : 얼굴, 체형, 비율, 아트 스타일, 컬러 팔레트
변경 대상       : 포즈, 의상 accent 색상만
```

### 3-1. 캐릭터 순환 (엄격)

| ID | 이름 | 파일 |
|----|------|------|
| A | 조라니 | `characters/조라니_캐릭터.png` (실사 스타일) |
| B | 라니  | `characters/라니_캐릭터_포트폴리오.png` (일러스트 카툰) |
| C | 둥이  | `characters/둥이_캐릭터_포트폴리오.png` (통통 일러스트) |

**사이클**: A → B → C → A (연속 반복 절대 금지)  
상태 파일: `session.json` → `last_character`

### 3-2. 포즈 매핑 (품목 기반)

`CHAR_POSE_MAP` (generate_thumbnail.py 내 정의)

| 품목 | 포즈 |
|------|------|
| 후드 | 양손 위로, 환풍기 닦기 |
| 주방 | 청소용품 양손, 자신감 포즈 |
| 바닥 | 무릎 꿇고 대걸레 |
| 에어컨 | 필터 검사 |
| 욕실 | 거품 솔, 쭈그려 앉기 |
| 유리 | 스퀴지 양손, 유리 닦기 |
| 덕트 | 점검 도구, 위 쳐다보기 |
| 냉장고 | 문 열고 청소 |
| 외벽 | 고압세척기 분사 |
| 화장실 | 청소 스틱, 서 있기 |
| (기타) | 기본 포즈 (CHAR_POSE_DEFAULT) |

### 3-3. 의상 매핑 (컬러 기반)

`CHAR_OUTFIT_MAP` — 기본 구조(파란 작업모 + 흰 장갑 + 네이비 작업복) 고정.  
`accent 스트라이프 색상`만 color 인자에 따라 변경.

| color | accent |
|-------|--------|
| yellow | 밝은 노랑 |
| red    | 빨강 |
| pink   | 핑크 |
| cyan   | 시안 |
| white  | 흰색 (본체 흰색) |
| green  | 네온 그린 |

### 3-4. 캐시 (필수)

- 경로: `scripts/marketing/characters/cache/{캐릭터}_{품목}_{컬러}.png`
- 동일 조합 재호출 시 캐시 히트 → Nano Banana 미호출
- 최대 가능 수: 3(캐릭터) × 10(품목) × 6(컬러) = 180장
- 캐릭터 프롬프트/rembg 설정 변경 시 **캐시 전체 삭제 후 재생성 필수**

### 3-5. 배경 제거 (투명 배경 + 내부 hole)

```python
session = rembg.new_session('isnet-general-use')
rembg.remove(
    edited_bytes,
    session=session,
    alpha_matting=True,
    alpha_matting_foreground_threshold=240,
    alpha_matting_background_threshold=20,
    alpha_matting_erode_size=8,
    post_process_mask=True,
)
```

- `isnet-general-use`: u2net보다 세밀한 엣지/hole 감지
- `alpha_matting=True`: 팔 사이, 손가락 사이 등 negative space 투명화
- Fallback: `u2net` + `post_process_mask=True`
- **프롬프트에도 "팔·머리·몸통·다리 사이 공간은 완전 투명" 명시 필수**

### 3-6. 실패 처리 (안전망)

1. `GEMINI_API_KEY` 없음 → 정적 크롭 방식 fallback
2. Nano Banana 호출 실패 → 정적 크롭 방식 fallback
3. rembg `isnet` 실패 → `u2net` fallback → 실패 시 원본 사용

---

## 4. 레이아웃 규칙 (HTML/CSS, 필수)

### 4-1. 캔버스
- **크기**: 1080×1080 (1:1 고정). 블로그·인스타 구분 없음.
- `device_scale_factor: 2` (2x 리티나급 선명도)

### 4-2. 캐릭터 배치 (중앙부)

```css
.character {
  position: absolute;
  bottom: 60px;
  right: 100px;
  height: 52%;
  max-width: 48%;
  object-fit: contain;
  object-position: right bottom;
  filter: drop-shadow(4px 4px 14px rgba(0,0,0,0.45));
  z-index: 1;
}
```

- 우측 하단 **중앙부 쪽**에 배치 (코너·가장자리 밀기 금지)
- 타이틀과 미세한 겹침은 허용
- `z-index: 1` — 타이틀(z:2) 뒤에 배치되어 글자 가독성 보장

### 4-3. 텍스트 영역

```css
.content { z-index: 2; pointer-events: none; }
.title   { font: 170px 'Black Han Sans'; color: accent; text-shadow: 5px 6px 0 rgba(0,0,0,.5); }
```

- 타이틀 170px, 검은고딕(Black Han Sans)
- 화면 50~70% 점유가 원칙
- `z-index: 2`로 항상 캐릭터 위에 렌더

### 4-4. 오버레이
- 하단으로 갈수록 어두워지는 그라데이션 (가독성 확보)
- `rgba(0,0,0, 0.10 → 0.30 → 0.50)`

---

## 5. 스타일·컬러 순환 (엄격)

`session.json`으로 상태 관리. 연속 동일 값 금지.

| 항목 | 후보 | 규칙 |
|------|------|------|
| style | bold / vintage / scatter / clean | last_style 제외 랜덤 |
| color | yellow / red / pink / cyan | last_color 제외 랜덤 |
| character | A / B / C | A→B→C→A 엄격 사이클 |

### session.json 포맷
```json
{
  "last_character": "A",
  "last_style": "bold",
  "last_color": "yellow",
  "last_font_category": "ARTISTIC",
  "generation_count": 0
}
```

---

## 6. 생성 스크립트 (단일 진입점)

### CLI
```bash
python scripts/marketing/generate_thumbnail.py \
  --title "잠실 후드청소" \
  --region "잠실" \
  --item "후드청소" \
  --bg auto \
  --char 라니 \
  --style bold \
  --color yellow \
  --out ./thumbnails
```

| 인자 | 필수 | 비고 |
|------|------|------|
| `--title` | ✅ | 메인 타이틀 |
| `--sub` |  | 서브 텍스트 (영문 권장) |
| `--region` |  | 지역 태그 |
| `--item` |  | 품목 ("청소" 접미사 허용, 내부 자동 정규화) |
| `--bg` |  | `auto` 또는 이미지 경로 |
| `--char` |  | `라니` / `둥이` / `조라니` |
| `--style` |  | `bold` / `vintage` / `scatter` / `clean` |
| `--color` |  | `yellow` / `red` / `pink` / `cyan` / `white` / `green` |
| `--out` |  | 출력 디렉토리 (기본: `./thumbnails`) |

### 출력
```
{region}_{item}_{YYYYMMDD}.png  (1080×1080 단일 파일)
```

---

## 7. 품질 게이트 (생성 후 반드시 점검)

- [ ] 해상도 1080×1080 (1:1)
- [ ] 한글 텍스트 깨짐 없음 (Imagen에 한글 넣지 않음)
- [ ] 캐릭터 순환 규칙 지킴 (A→B→C)
- [ ] 캐릭터 포즈가 품목과 일치 (예: 후드→손 위로)
- [ ] 캐릭터 의상 accent가 color 인자와 일치
- [ ] 팔 사이·머리-팔 사이 등 내부 hole 투명 처리됨
- [ ] 캐릭터가 중앙부 쪽 배치 (코너/가장자리 밀착 금지)
- [ ] 타이틀 가독성 확보 (z-index로 텍스트 앞)
- [ ] 배경이 품목과 일치 (후드→주방, 유리→건물 외관)
- [ ] session.json 업데이트됨

---

## 8. 절대 금지 목록

- 🚫 Imagen 프롬프트에 한글/영문 텍스트 포함
- 🚫 Pillow ImageDraw로 텍스트 합성
- 🚫 `@napi-rs/canvas` 단순 템플릿 합성
- 🚫 로컬 정적 캐릭터 PNG 단순 크롭만 사용 (동적 포즈 없이)
- 🚫 캐릭터 순환 건너뛰기 (같은 캐릭터 연속 2회)
- 🚫 캐릭터를 캔버스 완전 가장자리(`right: 0` 이하)로 밀어내기
- 🚫 "키친 케어" 표현, 경쟁사 로고, 임의 가격 표기

---

## 9. 기술 스택 요약

| 레이어 | 기술 |
|--------|------|
| 배경 생성 | Google Imagen 4 (REST) |
| 캐릭터 편집 | Google Nano Banana / Gemini 2.5 Flash Image (REST, image-to-image) |
| 배경 제거 | rembg `isnet-general-use` + alpha matting |
| 레이아웃/텍스트 | HTML + CSS (Pretendard, Black Han Sans, Noto Sans KR) |
| 렌더러 | Playwright Chromium (headless, device_scale_factor=2) |
| 상태 관리 | `session.json` (순환 규칙) |
| 캐시 | `characters/cache/{char}_{item}_{color}.png` |

**이 스택을 벗어나는 구현을 도입하지 않는다.**
