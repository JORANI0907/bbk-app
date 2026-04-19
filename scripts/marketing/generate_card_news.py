#!/usr/bin/env python3
"""
BBK 인스타 Tips 카드뉴스 5장 생성기 (1080×1080 × 5장)

카드 구성:
  1 표지   — 훅 제목, (옵션) 캐릭터, (옵션) 배경
  2 원인   — head / title / body
  3 Tip 1  — head / title / body
  4 Tip 2  — head / title / body
  5 CTA    — head / title / body (BBK 공간케어 전화/DM 연결)

디자인 원칙 (THUMBNAIL.md 연장):
  - 텍스트는 전부 HTML + Playwright (한글 깨짐 금지)
  - 캐릭터는 표지만. 본문은 브랜드 팔레트·심플한 정보 카드
  - 공통 하단 브랜드 바 (BBK 공간케어)
  - 스타일 일관성: 같은 색상 팔레트·폰트, 카드 번호만 변경

사용법:
  python generate_card_news.py --data ./tips.json --out ./cards/
    tips.json:
    {
      "title": "후드 기름때, 5분이면 OK",
      "cover": {"line1": "후드 기름때", "line2": "5분이면 충분합니다"},
      "body": [
        {"head": "원인",  "title": "왜 쌓일까?",      "body": "조리 시 ..."},
        {"head": "Tip 1", "title": "식초 + 베이킹소다", "body": "1:1 희석 ..."},
        {"head": "Tip 2", "title": "월 1회 필터 세척", "body": "필터 분리 ..."}
      ],
      "cta":  {"head": "상담", "title": "전문가에게 맡기세요", "body": "BBK ... / DM ..."},
      "character_data_url": "data:image/png;base64,...",
      "background_data_url": "data:image/png;base64,..."
    }
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# 캐릭터/배경 생성 재사용
sys.path.insert(0, str(Path(__file__).parent))
from generate_thumbnail import (  # type: ignore
    generate_character_with_pose,
    fetch_bg_from_gemini,
    image_to_data_url,
)


CARD_SIZE = (1080, 1080)


# ─── 공통 CSS ────────────────────────────────────────────────────────────────

BRAND_CSS = '''
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
@font-face {
  font-family: 'Black Han Sans';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/BlackHanSans.woff') format('woff');
}

:root {
  --brand-blue: #2BA6F2;
  --brand-navy: #1A3A5C;
  --brand-yellow: #FFE600;
  --text-dark: #111111;
  --text-mid:  #444444;
  --bg-soft:   #F5F5F5;
  --bg-card:   #FFFFFF;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 1080px; height: 1080px;
  font-family: 'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--text-dark);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.canvas { width: 1080px; height: 1080px; position: relative; overflow: hidden; }

.brand-bar {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 64px;
  background: var(--brand-navy);
  color: white;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 36px;
  font-weight: 700; font-size: 20px; letter-spacing: 0.04em;
}
.brand-bar .logo { color: var(--brand-yellow); font-weight: 900; letter-spacing: 0.08em; }
.brand-bar .page { opacity: 0.7; font-weight: 500; font-size: 18px; }
'''


# ─── 카드 1: 표지 ────────────────────────────────────────────────────────────

def build_cover_card(data: dict) -> str:
    cover = data.get('cover', {})
    line1 = cover.get('line1', '')
    line2 = cover.get('line2', '')
    char_src = data.get('character_data_url') or ''
    bg_src   = data.get('background_data_url') or ''

    bg_css = f'background-image: url("{bg_src}"); background-size: cover; background-position: center;' if bg_src else \
             'background: linear-gradient(135deg, #1A3A5C, #2BA6F2);'

    char_html = f'<img class="character" src="{char_src}">' if char_src else ''

    return f'''<!doctype html>
<html><head><meta charset="utf-8"><style>
{BRAND_CSS}
.cover {{
  width: 100%; height: 100%;
  {bg_css}
  position: relative;
}}
.overlay {{
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.55) 100%);
}}
.title-wrap {{
  position: absolute; top: 60px; left: 0; right: 0;
  padding: 40px 60px;
  text-align: center;
  z-index: 3;
}}
.line1 {{
  font-family: 'Black Han Sans', 'Pretendard', sans-serif;
  font-size: 120px; line-height: 1.05;
  color: var(--brand-yellow);
  text-shadow: 6px 6px 0 rgba(0,0,0,0.55);
  letter-spacing: -0.01em;
  margin-bottom: 24px;
}}
.line2 {{
  font-family: 'Pretendard', sans-serif;
  font-weight: 700;
  font-size: 38px;
  color: white;
  text-shadow: 2px 3px 8px rgba(0,0,0,0.5);
  letter-spacing: 0.02em;
}}
.character {{
  position: absolute;
  bottom: 64px;
  right: 100px;
  height: 52%;
  max-width: 48%;
  object-fit: contain;
  object-position: right bottom;
  filter: drop-shadow(4px 6px 18px rgba(0,0,0,0.55));
  z-index: 1;
}}
.swipe-hint {{
  position: absolute; bottom: 90px; left: 60px;
  z-index: 3;
  color: white;
  font-size: 22px;
  font-weight: 600;
  background: rgba(0,0,0,0.45);
  padding: 10px 18px; border-radius: 999px;
  backdrop-filter: blur(6px);
}}
</style></head>
<body>
<div class="canvas cover">
  <div class="overlay"></div>
  {char_html}
  <div class="title-wrap">
    <div class="line1">{line1}</div>
    <div class="line2">{line2}</div>
  </div>
  <div class="swipe-hint">→ 스와이프</div>
  <div class="brand-bar"><span class="logo">BBK 공간케어</span><span class="page">1 / 5</span></div>
</div>
</body></html>'''


# ─── 카드 2~4: 본문 (head / title / body) ────────────────────────────────────

def build_body_card(item: dict, page_num: int) -> str:
    head  = item.get('head', '')
    title = item.get('title', '')
    body  = item.get('body', '').replace('\n', '<br>')

    return f'''<!doctype html>
<html><head><meta charset="utf-8"><style>
{BRAND_CSS}
.body-card {{
  width: 100%; height: 100%;
  background: var(--bg-soft);
  padding: 96px 72px 120px;
  display: flex; flex-direction: column;
}}
.head-chip {{
  display: inline-flex; align-self: flex-start;
  padding: 14px 32px;
  background: var(--brand-blue);
  color: white;
  font-weight: 900;
  font-size: 34px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  box-shadow: 0 6px 14px rgba(43,166,242,0.35);
  margin-bottom: 48px;
}}
.b-title {{
  font-family: 'Black Han Sans', 'Pretendard', sans-serif;
  font-size: 92px;
  line-height: 1.1;
  color: var(--brand-navy);
  letter-spacing: -0.01em;
  margin-bottom: 44px;
}}
.b-divider {{
  width: 88px; height: 8px;
  background: var(--brand-yellow);
  border-radius: 4px;
  margin-bottom: 44px;
}}
.b-body {{
  font-size: 46px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--text-dark);
  letter-spacing: -0.005em;
}}
.number-stamp {{
  position: absolute;
  bottom: 96px; right: 48px;
  font-family: 'Black Han Sans', 'Pretendard', sans-serif;
  font-size: 360px;
  line-height: 1;
  color: rgba(43,166,242,0.08);
  pointer-events: none;
}}
</style></head>
<body>
<div class="canvas body-card">
  <div class="number-stamp">{page_num - 1}</div>
  <div class="head-chip">{head}</div>
  <div class="b-title">{title}</div>
  <div class="b-divider"></div>
  <div class="b-body">{body}</div>
  <div class="brand-bar"><span class="logo">BBK 공간케어</span><span class="page">{page_num} / 5</span></div>
</div>
</body></html>'''


# ─── 카드 5: CTA ─────────────────────────────────────────────────────────────

def build_cta_card(cta: dict) -> str:
    head  = cta.get('head', '상담')
    title = cta.get('title', '전문가에게 맡기세요')
    body  = cta.get('body', 'BBK 공간케어가 해결합니다\nDM 또는 프로필 링크').replace('\n', '<br>')

    return f'''<!doctype html>
<html><head><meta charset="utf-8"><style>
{BRAND_CSS}
.cta-card {{
  width: 100%; height: 100%;
  background: linear-gradient(135deg, var(--brand-navy), var(--brand-blue));
  padding: 120px 72px;
  display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
  color: white;
  position: relative;
}}
.cta-head {{
  display: inline-flex;
  padding: 14px 36px;
  background: var(--brand-yellow);
  color: var(--text-dark);
  font-weight: 900;
  font-size: 34px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  margin-bottom: 48px;
}}
.cta-title {{
  font-family: 'Black Han Sans', 'Pretendard', sans-serif;
  font-size: 108px;
  line-height: 1.1;
  color: white;
  margin-bottom: 48px;
  text-shadow: 3px 4px 0 rgba(0,0,0,0.25);
}}
.cta-body {{
  font-size: 46px;
  font-weight: 700;
  line-height: 1.55;
  color: white;
  margin-bottom: 64px;
}}
.contact {{
  display: flex; gap: 24px; flex-wrap: wrap; justify-content: center;
}}
.contact-chip {{
  background: rgba(255,255,255,0.14);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255,255,255,0.25);
  padding: 18px 32px;
  border-radius: 999px;
  font-size: 32px; font-weight: 700;
}}
</style></head>
<body>
<div class="canvas cta-card">
  <div class="cta-head">{head}</div>
  <div class="cta-title">{title}</div>
  <div class="cta-body">{body}</div>
  <div class="contact">
    <div class="contact-chip">📞 010-5434-4877</div>
    <div class="contact-chip">💬 카톡채널: BBK</div>
  </div>
  <div class="brand-bar"><span class="logo">BBK 공간케어</span><span class="page">5 / 5</span></div>
</div>
</body></html>'''


# ─── 렌더링 ──────────────────────────────────────────────────────────────────

def render_cards(cards: list[tuple[str, str]], out_dir: Path) -> list[Path]:
    paths: list[Path] = []
    out_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for filename, html in cards:
            page = browser.new_page(
                viewport={'width': CARD_SIZE[0], 'height': CARD_SIZE[1]},
                device_scale_factor=2,
            )
            page.set_content(html, wait_until='networkidle')
            out_path = out_dir / filename
            page.screenshot(path=str(out_path), full_page=False)
            page.close()
            paths.append(out_path)
            print(f'  card saved: {filename}')
        browser.close()
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description='BBK 인스타 Tips 카드뉴스 생성기')
    parser.add_argument('--data',  required=True, help='JSON 데이터 파일 (cover/body/cta)')
    parser.add_argument('--out',   required=True, help='출력 디렉토리')
    parser.add_argument('--char',  default='',    choices=['', '라니', '둥이', '조라니'], help='표지 캐릭터 (선택)')
    parser.add_argument('--item',  default='',    help='품목 (배경 생성용, 예: 후드)')
    parser.add_argument('--color', default='yellow', help='의상 컬러 (yellow/red/pink/cyan/green)')
    parser.add_argument('--scene', default='',    help='라이프스타일 씬 키 (선택, item 대신 사용)')
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(f'데이터 파일 없음: {data_path}')
    data = json.loads(data_path.read_text(encoding='utf-8'))

    script_dir = Path(__file__).parent

    # 캐릭터 data URL 자동 주입 (JSON에 없을 때만)
    if args.char and not data.get('character_data_url'):
        print(f'[card-news] 캐릭터 생성: {args.char} / {args.item or args.scene} / {args.color}')
        char_url = generate_character_with_pose(
            args.char, args.item, args.color, script_dir, scene=args.scene
        )
        if char_url:
            data['character_data_url'] = char_url

    # 배경 data URL 자동 주입 (JSON에 없을 때만)
    if not data.get('background_data_url'):
        bg_item = (args.item or '').replace('청소', '').strip()
        print(f'[card-news] 배경 생성: item={bg_item} scene={args.scene}')
        bg_path = fetch_bg_from_gemini(bg_item, scene=args.scene)
        if bg_path:
            data['background_data_url'] = image_to_data_url(bg_path)

    out_dir = Path(args.out)

    cards: list[tuple[str, str]] = []
    cards.append(('card_1_cover.png', build_cover_card(data)))

    body_items = data.get('body', [])
    for i, item in enumerate(body_items[:3]):
        cards.append((f'card_{i + 2}_body.png', build_body_card(item, i + 2)))

    cards.append(('card_5_cta.png', build_cta_card(data.get('cta', {}))))

    print(f'카드뉴스 생성 중... ({len(cards)}장)')
    paths = render_cards(cards, out_dir)
    print(f'done: {len(paths)}장 / {out_dir.resolve()}')


if __name__ == '__main__':
    main()
