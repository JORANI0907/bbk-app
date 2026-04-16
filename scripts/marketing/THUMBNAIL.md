# BBK 썸네일 생성 가이드

## 생성 스크립트

```bash
python scripts/generate_thumbnail.py [옵션]
```

## 주요 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--title` | 메인 타이틀 (필수) | - |
| `--sub` | 서브 텍스트 | 없음 |
| `--region` | 지역 태그 | 없음 |
| `--item` | 서비스 품목 태그 | 없음 |
| `--bg` | 배경 이미지 경로 | 회색 플레이스홀더 |
| `--type` | `blog` / `insta` / `both` | `both` |
| `--style` | `bold` / `poster` / `clean` | `bold` |
| `--color` | `yellow` / `red` / `pink` / `white` / `cyan` | `yellow` |
| `--out` | 출력 디렉토리 | `./thumbnails` |

## 사용 예시

```bash
# 블로그 + 인스타 동시 생성 (기본)
python scripts/generate_thumbnail.py \
  --title "성남 주방후드 청소" \
  --sub "상업용 주방 전문 업체" \
  --region "성남" \
  --item "후드" \
  --bg "C:/path/to/kitchen.jpg"

# 배경 없이 테스트
python scripts/generate_thumbnail.py \
  --title "강남 식당 바닥 청소" \
  --region "강남" \
  --item "바닥"

# 인스타만, 핑크 색상
python scripts/generate_thumbnail.py \
  --title "분당 에어컨 청소" \
  --type insta \
  --color pink \
  --bg "bg.jpg"
```

## 출력 파일명 규칙

```
thumbnails/
  {region}_{item}_{YYYYMMDD}_blog.png   (1200×630)
  {region}_{item}_{YYYYMMDD}_insta.png  (1080×1080)
```

---

## 디자인 스펙

### 치수

| 타입 | 크기 | 용도 |
|------|------|------|
| blog | 1200×630px | 네이버 블로그 대표 이미지 |
| insta | 1080×1080px | 인스타그램 피드 |

### BBK 브랜드 색상

- 메인 블루: `#003087`
- 틸 그린: `#006670`
- 강조 노랑: `#FFE600`
- 강조 레드: `#FF2D2D`
- 강조 핑크: `#FF4FA0`
- 강조 시안: `#00E5FF`

### 폰트

- 한글 타이틀: **Black Han Sans** (Google Fonts, 900 weight)
- 한글 서브: **Noto Sans KR** (700 weight)
- 영문/숫자: **Black Han Sans** 또는 **Oswald**

### 레이아웃 스타일

#### bold (기본)
- 배경 사진 풀 블리드
- 하단 그라데이션 오버레이
- 초대형 타이틀 (중앙 or 좌측 정렬)
- 상단 지역 태그 배지
- 하단 BBK 브랜딩

#### poster
- 배경 사진 + 반투명 오버레이
- 상단 서비스 태그
- 중앙 대형 타이틀 (2~3줄 허용)
- 하단 날짜/연락처 가능

#### clean
- 배경 사진 좌측 50%
- 우측 순백 or 브랜드 컬러 배경
- 타이틀 우측 정렬

---

## 캐릭터 순환 규칙 (자동화용)

아직 미구현. 향후 캐릭터 이미지(청소 작업자 일러스트) 추가 예정.

---

## 배경 사진 자동 생성 (미구현)

Gemini Imagen API를 통해 사진 배경 자동 생성 예정.
- 사용 시나리오: `--bg auto`
- 프롬프트 패턴: `Commercial {item} cleaning, professional, bright lighting, Korea restaurant interior`

---

## 자동화 연동 (투트랙)

### 1. 수동 (bbk-marketer 에이전트)
```bash
python scripts/marketing/generate_thumbnail.py --title "..." --region "..." --item "..."
```

### 2. 자동 (VPS — 월/수/금 06:00)

**흐름:**
```
Make 스케줄러 (월/수/금)
  → POST https://bbk-app.vercel.app/api/marketing/generate-thumbnail
  → VPS /api/generate-thumbnail
  → python scripts/marketing/generate_thumbnail.py 실행
  → 결과 Slack 전송
```

**VPS가 받는 요청 Body:**
```json
{
  "title": "성남 주방후드 청소",
  "sub": "상업용 주방 전문 업체",
  "region": "성남",
  "item": "후드",
  "bg_url": "https://...",
  "type": "both",
  "color": "yellow",
  "trigger_type": "auto"
}
```

**VPS 구현 참고사항:**
- `scripts/marketing/generate_thumbnail.py` 실행 (repo clone 또는 symlink)
- `--bg` 옵션: `bg_url`을 로컬에 다운로드 후 경로 전달
- 생성 결과물은 Slack에 파일로 업로드하거나 CDN 업로드 후 URL 반환
- 엔드포인트: `POST /api/generate-thumbnail` (Bearer 토큰 인증)
