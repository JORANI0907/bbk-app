# BBK 썸네일 가이드

> **필수 규칙**: `scripts/marketing/THUMBNAIL.md` 반드시 먼저 읽기.
> 자동·수동 구분 없이 동일 규칙 적용.

## 단일 진입점
- 스크립트: `scripts/marketing/generate_thumbnail.py`
- 세션 상태: `scripts/marketing/session.json`
- 캐시: `scripts/marketing/characters/cache/`

```bash
python scripts/marketing/generate_thumbnail.py \
  --title "..." --region "..." --item "..." \
  --bg auto --char 라니 --style bold --color yellow
```

## 핵심 요약 (상세는 scripts/marketing/THUMBNAIL.md)
- 배경: Imagen 4 (텍스트 없음)
- 캐릭터: Nano Banana image-to-image (품목별 포즈, 컬러별 의상)
- 배경 제거: rembg `isnet-general-use` + alpha matting (팔 사이 hole 투명화)
- 텍스트: HTML/CSS + Playwright (Pillow/Canvas 금지)
- 레이아웃: 캐릭터 중앙부 배치 (bottom:60, right:100, height:52%)
- 순환: 캐릭터 A→B→C, 스타일/컬러 last 제외 랜덤
