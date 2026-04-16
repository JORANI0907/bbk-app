# BBK 썸네일 생성 가이드
# Claude Code Instruction File

---

## 아키텍처

### Phase 1 (현재 운영)
```
Make 트리거
  → Claude가 Imagen 4 프롬프트 생성
  → Gemini Imagen 4 API (Google AI Studio)
  → PNG 배경 출력
  → generate_thumbnail.py로 텍스트 합성
```

### Phase 2 (전체 시스템)
```
Make 트리거
  → Claude가 프롬프트 생성
  → Gemini Imagen 4 (배경 + 캐릭터, 텍스트 미포함)
  → Python Pillow 서버
  → 한/영 텍스트 합성
  → 최종 PNG
```

**핵심 규칙**: Imagen 프롬프트에 한글/영문 텍스트 내용 절대 포함 금지.
AI가 렌더링한 한/영 혼용 텍스트는 항상 깨짐. 텍스트 영역(빈 공간)만 프롬프트에 묘사.
텍스트는 Phase 2에서 Pillow가 합성.

---

## 생성 스크립트 (Phase 1)

```bash
python scripts/marketing/generate_thumbnail.py [옵션]
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--title` | 메인 타이틀 (필수) | - |
| `--sub` | 서브 텍스트 | 없음 |
| `--region` | 지역 태그 | 없음 |
| `--item` | 서비스 품목 태그 | 없음 |
| `--bg` | 배경 이미지 경로 또는 `auto` | 플레이스홀더 |
| `--char` | `라니` / `둥이` / `조라니` | 없음 |
| `--style` | `bold` / `vintage` / `scatter` / `clean` | `bold` |
| `--color` | `yellow` / `red` / `pink` / `white` / `cyan` | `yellow` |
| `--out` | 출력 디렉토리 | `./thumbnails` |

> `--type` 옵션 폐지. 출력은 **1:1 단일 파일**만 생성.

### 사용 예시

```bash
# 기본 생성 (1:1 단일 출력)
python scripts/marketing/generate_thumbnail.py \
  --title "성남 주방후드 청소" --region "성남" --item "후드" \
  --bg auto --char 라니

# 핑크 색상
python scripts/marketing/generate_thumbnail.py \
  --title "분당 에어컨 청소" --color pink --char 둥이
```

### 출력 파일명
```
thumbnails/
  {region}_{item}_{YYYYMMDD}.png   (1080×1080, 1:1 고정)
```

---

## Imagen 4 API 스펙

```
Model: imagen-4.0-generate-001
Endpoint: https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict
Auth: Google AI Studio API key (GOOGLE_AI_STUDIO_KEY)
```

```json
{
  "instances": [{
    "prompt": "[POSITIVE PROMPT]"
  }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "1:1",
    "personGeneration": "dont_allow",
    "safetySetting": "block_some"
  }
}
```

> 출력 해상도: **1080×1080 (1:1 고정)**. 블로그/인스타 구분 없음.

---

## 캐릭터 시스템

순환 순서: **A → B → C → A** (엄격한 사이클, 연속 반복 금지)
생성 전 `session.json`의 `last_character` 확인 필수.

| ID | 이름 | 로컬 파일 | Google Drive ID | 설명 |
|----|------|-----------|-----------------|------|
| A | 조라니 | `characters/조라니_캐릭터.png` | `1g_y8-N60NteCrFcKNPGzWtbKMHtEp2Z2` | 실사 스타일 |
| B | 라니 | `characters/라니_캐릭터_포트폴리오.png` | `1pDwaVJ2LJkJ8RP1SrVhijl15VW7_8tfr` | 일러스트 카툰 |
| C | 둥이 | `characters/둥이_캐릭터_포트폴리오.png` | `1KDRnT8K7oW-3rTLdgrhjE-dXofDCOmvE` | 통통 일러스트 |

### 캐릭터별 프롬프트 디스크립터

**A - 조라니**
```
Jorani, a realistic-style illustrated Korean roe deer (고라니) character,
expressive large eyes, soft fur texture, realistic proportions, warm friendly face
```

**B - 라니**
```
Rani, a cute illustrated Korean roe deer (고라니) character,
clean cartoon style, rounded shapes, big expressive eyes, simple clean linework
```

**C - 둥이**
```
Dungee, a chubby adorable illustrated Korean roe deer (고라니) character,
soft rounded body, extra fluffy appearance, chibi proportions, very cute expression
```

### 캐릭터 생성 방식 (Gemini Imagen — 배경 제거형)

로컬 PNG 파일 사용 금지. 썸네일 주제와 조화롭도록 **Imagen으로 캐릭터 직접 생성**.

생성 시 반드시 포함할 4가지 요소:
1. **자세(Pose)** — 서비스 품목과 연관된 동작 (예: 후드 청소 → 위를 닦는 자세)
2. **컨셉(Concept)** — 배경 스타일과 어울리는 씬/무드 (예: BOLD GRAPHIC → 히어로 포즈)
3. **표정(Expression)** — 콘텐츠 톤에 맞는 감정 (예: 밝고 자신감 있는 미소)
4. **의상(Outfit)** — BBK 작업복 컨셉 (파란 작업모, 흰 장갑, 로고 없는 작업복)

#### 캐릭터 Imagen 프롬프트 구조
```
[캐릭터 디스크립터],
[자세: 구체적 동작],
[컨셉: 씬과 소품],
[표정: 감정 상태],
[의상: 작업복 디테일].
transparent background, isolated character, no background, clean cutout,
white background, full body or 3/4 view, facing slightly left,
highly detailed illustration, crisp clean edges, commercial mascot quality
```

#### negative prompt (캐릭터용)
```
background, environment, scene, landscape, floor, wall, ceiling,
text, letters, watermark, logo,
multiple characters, dark background, busy background
```

### 캐릭터 공통 규칙
- 배경 완전 제거 (transparent/white background only)
- 핵심 디자인 고정, 변형 가능 요소: 포즈·액션·소품·표정·씬·의상
- 얼굴 클로즈업 금지 (전신 또는 3/4 뷰)
- 청소/라이프스타일/서비스 콘텐츠 관련 맥락 유지
- 썸네일 accent 색상 계열로 의상/소품 색상 맞춤 권장

### 배치 규칙 (1:1 기준)
- 우측 하단 배치, 이미지 높이의 55%
- 타이틀과 겹치지 않도록 배치

### 품목별 자세 예시
| 품목 | 권장 자세 |
|------|----------|
| 후드 | 머리 위로 걸레질, 청소 솔 들어올림 |
| 바닥 | 무릎 꿇고 바닥 닦기, 대걸레 밀기 |
| 에어컨 | 에어컨 필터 들고 검사, 분무기 들기 |
| 유리/창문 | 스퀴지 양손으로 잡고 닦기 |
| 욕실 | 거품 솔 들고 청소 중 |
| 덕트 | 작업 도구 들고 점검 포즈 |
| 냉장고 | 문 열고 내부 닦기 |
| 주방 전체 | 두 손으로 청소 도구 들고 자신감 포즈 |

---

## 스타일 라이브러리 (6종 순환)

연속 동일 스타일 금지. `session.json`의 `last_style` 확인 후 선택.

### STYLE_01 — FLAT PASTEL
- 배경: 부드러운 파스텔 그라데이션, 부드러운 색상 전환
- 강조: 작은 도형 떠다님(원·별·삼각형), 소프트 드롭섀도
- 무드: 따뜻함, 친근함, 접근하기 쉬운
- 텍스트 존: 상단 1/3 클린 빈 공간, 소프트 그라데이션
- 팔레트 예시: 복숭아+라벤더 / 민트+버터옐로 / 블러쉬+스카이블루

### STYLE_02 — BOLD GRAPHIC (bold 스타일 대응)
- 배경: 단색 컬러 블록, 최대 2색, 하드엣지 분할
- 강조: 캐릭터 두꺼운 검정 아웃라인, 하프톤 도트 20% 오버레이
- 무드: 자신감, 강렬함, 하이에너지
- 텍스트 존: 상단 30% 가로 밴드, 명확한 대비
- 오버레이: 35% (배경 사진 자연 노출)
- 팔레트 예시: 일렉트릭 옐로+블랙 / 코랄+화이트 / 코발트+크림

### STYLE_03 — TEXTURED ORGANIC
- 배경: 수채화 워시 텍스처, 종이 그레인, 부드러운 붓터치
- 강조: 손그림 낙서 요소(별·선·점), 잉크 스플래시
- 무드: 창의적, 수공예, 따뜻함
- 텍스트 존: 좌상단 유기적 빈 공간

### STYLE_04 — MINIMAL EDITORIAL (clean 스타일 대응)
- 배경: 오프화이트, 연한 웜그레이, 단일 페일톤
- 강조: 단 하나의 액센트 컬러 요소만
- 무드: 클린, 프리미엄, 세련됨
- 텍스트 존: 상단 절반 대형 네거티브 스페이스
- 오버레이: 15%

### STYLE_05 — DARK MOODY (vintage 스타일 대응)
- 배경: 깊은 다크톤, 풍부한 그림자, 미세 텍스처
- 강조: 네온/메탈릭 팝, 캐릭터 림 라이팅
- 무드: 드라마틱, 프리미엄, 미스터리
- 텍스트 존: 상단 1/3 다크 분위기 여백
- 오버레이 없음, 텍스트에 stroke 아웃라인 적용

### STYLE_06 — Y2K RETRO (scatter 스타일 대응)
- 배경: 2000년대 그라데이션(크롬·캔디·홀로그래픽)
- 강조: 스타버스트, 픽셀 요소, 3D 드롭섀도, 렌즈플레어
- 무드: 노스탤지어, 펀, 비비드
- 텍스트 존: 레트로 그라데이션 스카이 상단 40%
- 태그들을 타이틀 주변 산포 배치

---

## 타이포그래피 (Phase 2 Pillow 합성)

카테고리 순환. 연속 동일 카테고리 금지. `last_font_category` 확인.

| 카테고리 | 스타일 | 사용 상황 |
|----------|--------|-----------|
| ARTISTIC | 손글씨, 브러시 캘리그래피, 실험적 디스플레이 | 감성·스토리텔링·브랜드 |
| CLEAN | 기하학 산세리프, 모던 미니멀, 스위스 스타일 | 정보·전문적·서비스 |
| SOFT | 라운드 산세리프, 부드러운 곡선, 친근함 | 라이프스타일·커뮤니티 |

**금지 폰트**: 고딕체, Heavy 슬랩 세리프, 딱딱한 폰트, 기본 시스템 폰트

### 텍스트 배치 규칙
- 박스·컨테이너 안에 절대 넣지 말 것
- 배경 위에 자유롭게 플로팅
- 가독성: 그림자(2-3px, 50%) 또는 아웃라인(1-2px) 또는 색상 대비
- 최대 2줄

### 한/영 레이아웃 패턴
- **Pattern A**: 한글 대형(메인) / 영문 소형 하단 60% 불투명도
- **Pattern B**: 영문 대형(훅) / 한글 중형 하단
- **Pattern C**: 동일 크기, 교대 줄, 다른 폰트 웨이트

---

## BBK 브랜드 색상

| 색상 | HEX | 용도 |
|------|-----|------|
| 메인 블루 | `#003087` | 브랜드 기본 |
| 틸 그린 | `#006670` | 보조 |
| 강조 노랑 | `#FFE600` | 메인 accent (기본) |
| 강조 레드 | `#FF2D2D` | 강렬한 강조 |
| 강조 핑크 | `#FF4FA0` | 감성 강조 |
| 강조 시안 | `#00E5FF` | 청량 강조 |

### 타이틀 크기
| 해상도 | 타이틀 크기 |
|--------|------------|
| 1080×1080 (1:1) | 170px |

> 타이틀이 화면의 50~70% 점유. 텍스트가 이미지의 주인공.
> 흰색 타이틀보다 **accent 색상** 타이틀이 원칙.

---

## Imagen 프롬프트 템플릿

```
positive prompt:
"""
[CHARACTER SYSTEM의 캐릭터 디스크립터].
[구체적인 포즈와 액션 - 상세하게].
[콘텐츠 주제와 관련된 소품/액세서리].

[STYLE_XX] style illustration.
Background: [구체적인 색상 팔레트 - 실제 색상명 사용].
[STYLE LIBRARY의 강조 요소].

Lighting: [구체적 - e.g. soft front light / dramatic side rim light].
Composition: [STYLE LIBRARY의 텍스트 존]. Character positioned [프레임 내 위치].

highly detailed illustration, Pinterest aesthetic, trending on Behance,
professional graphic design, crisp clean edges, vibrant saturated colors,
commercial quality, social media thumbnail style
"""

negative prompt:
"""
text, letters, words, numbers, Korean characters, English characters,
typography, watermark, signature, logo, captions, labels,
blurry, low resolution, pixelated, grainy, noisy, overexposed, washed out,
flat boring lighting, generic clip art, stock photo look,
cluttered background, messy composition, too many elements,
boxes around text, text containers, speech bubbles
"""
```

---

## 배경 자동 생성 (`--bg auto`)

`--bg auto` 옵션 시 **Gemini Imagen 우선 → Pexels fallback** 순으로 배경 생성.

### API 키 설정 (`.env.local`)
```
GEMINI_API_KEY=your_key_here   # https://aistudio.google.com (무료, 우선)
PEXELS_API_KEY=your_key_here   # https://www.pexels.com/api/ (무료, fallback)
```

### 배경 생성 방식
| 방식 | 조건 | 결과 |
|------|------|------|
| Gemini Imagen | GEMINI_API_KEY 있음 | AI 생성 이미지 |
| Pexels | PEXELS_API_KEY 있음 | 실제 사진 검색 |
| 실제 사진 | Google Drive 연동 | 현장 촬영 사진 |

| 품목 | 검색 키워드 |
|------|------------|
| 후드 | commercial kitchen hood exhaust cleaning |
| 주방 | commercial kitchen restaurant interior |
| 바닥 | commercial floor cleaning restaurant |
| 에어컨 | air conditioner cleaning indoor |
| 욕실 | bathroom cleaning tile professional |
| 유리 | window glass cleaning commercial |
| 외벽 | building exterior wall cleaning |
| 덕트 | ventilation duct cleaning commercial |
| 냉장고 | commercial refrigerator cleaning |
| 화장실 | restroom toilet cleaning commercial |

---

## 세션 상태 관리

파일: `session.json` (프로젝트 루트)
생성 전 읽기, 생성 후 업데이트 필수.

```json
{
  "last_character": "A",
  "last_style": "STYLE_01",
  "last_font_category": "ARTISTIC",
  "generation_count": 0
}
```

순환 규칙:
- character: A→B, B→C, C→A (엄격한 사이클)
- style: last_style 제외 선택
- font_category: last_font_category 제외 선택

---

## Make.com 연동 (자동화)

### 자동 생성 흐름 (월/수/금 06:00 KST)

```
1. Make 스케줄러 트리거
2. Google Drive — 캐릭터 파일 다운로드 (CHARACTER SYSTEM 기반 순환)
3. HTTP — Claude API
     입력: 콘텐츠 주제, 메인 텍스트(KO), 서브 텍스트(EN)
     출력: positive_prompt, negative_prompt, font_category, text_zone
4. HTTP — Imagen 4 API
     URL: https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict
     출력: base64 PNG
5. [Phase 2] HTTP — Pillow 합성 서버
     입력: base64 PNG + 텍스트 + font_category + text_zone 좌표
     출력: 최종 PNG
6. Google Drive — 결과 파일 업로드
7. session.json 업데이트
8. Slack 알림 발송
```

### VPS 요청 Body (수동 트리거)
```json
{
  "title": "성남 주방후드 청소",
  "sub": "상업용 주방 전문 업체",
  "region": "성남",
  "item": "후드",
  "bg_url": "https://...",
  "color": "yellow",
  "char": "라니",
  "trigger_type": "auto"
}
```
> `type` 필드 삭제. 출력은 항상 1:1 단일 파일.

---

## Phase 2 파일 구조

```
scripts/marketing/
  THUMBNAIL.md              ← 이 파일
  generate_thumbnail.py     ← 메인 생성 스크립트 (Phase 1)
  compositor.py             ← Pillow 텍스트 합성 (Phase 2)
  session.json              ← 순환 상태
  characters/
    조라니_캐릭터.png        ← Character A
    라니_캐릭터_포트폴리오.png  ← Character B
    둥이_캐릭터_포트폴리오.png  ← Character C
  fonts/
    artistic/
    clean/
    soft/
```

---

## 디자인 방향성 (참고 이미지 기반)

참고 이미지 thumb1~8 분석 결과 핵심 원칙:

1. **타이틀이 주인공** — 화면 50~70% 점유, accent 컬러 타이틀
2. **배경 살리기** — 오버레이 최소화(35% 이하), 사진이 보여야 함
3. **색상 대비** — 흰색보다 노랑/레드/핑크 accent 타이틀
4. **스트로크 활용** — DARK MOODY 스타일에서 텍스트 아웃라인
5. **정보 최소화** — 태그·서브텍스트는 작게, 타이틀에 집중

---

## 품질 체크리스트

생성 전 확인:

- [ ] 출력 비율 1:1 (1080×1080) 고정 확인
- [ ] 캐릭터 순환 올바름 (last_character와 다름)
- [ ] 캐릭터 생성 시 자세/컨셉/표정/의상 4요소 포함
- [ ] 캐릭터 배경 제거 (transparent/white background only)
- [ ] 캐릭터 포즈가 서비스 품목과 연관됨
- [ ] 스타일 last_style과 다름
- [ ] 텍스트 존 프롬프트에 명확히 예약됨
- [ ] positive prompt에 한글/영문 텍스트 내용 없음
- [ ] quality boosters 추가됨
- [ ] negative prompt에 텍스트 관련 용어 포함
- [ ] 색상 팔레트 구체적 색상명 사용
- [ ] 조명 명시적으로 기술됨
- [ ] 인스타 별도 생성하지 않음 (1:1 단일 파일만)
- [ ] session.json 생성 후 업데이트

---

## 생성 예시

**입력**: 콘텐츠="후드 청소 홍보", 메인="주방후드 전문 청소", 서브="Commercial Hood Cleaning"
**세션**: last_character=A, last_style=STYLE_01, last_font_category=ARTISTIC
**출력**: 1080×1080 단일 파일

**선택**: Character B(라니), STYLE_02(Bold Graphic), font=CLEAN

#### 배경 프롬프트 (Gemini Imagen 1:1)
```
Commercial kitchen interior, stainless steel hood exhaust above cooking range,
professional restaurant kitchen atmosphere, warm dramatic lighting.

BOLD GRAPHIC style photo-illustration.
Electric yellow top band (top 35% clear space for text).
Halftone dot overlay at 15% opacity.

Composition: empty bold band top 35%, kitchen scene lower 65%.
highly detailed, commercial quality, social media thumbnail style
```

#### 캐릭터 프롬프트 (Gemini Imagen — 배경 제거)
```
Rani, a cute illustrated Korean roe deer character, clean cartoon style,
rounded shapes, big expressive eyes, simple clean linework.

Pose: reaching upward with both hands, scrubbing a surface overhead, dynamic action.
Concept: professional cleaning hero, energetic service worker scene.
Expression: bright confident smile, proud and enthusiastic.
Outfit: blue work cap, white cleaning gloves, yellow-accent work uniform, no logo.

transparent background, isolated character, no background, clean cutout,
full body, facing slightly left, highly detailed illustration,
crisp clean edges, commercial mascot quality
```

**Phase 2 텍스트 합성**:
- 존: 상단 35% 가로 밴드
- 1줄: "주방후드 전문 청소" — CLEAN font, #FFE600 accent, 3px dark shadow, 170px
- 2줄: "Commercial Hood Cleaning" — CLEAN font, white 65%, small

**세션 업데이트**: last_character=B, last_style=STYLE_02, last_font_category=CLEAN, count=1
