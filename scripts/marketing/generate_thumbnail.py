#!/usr/bin/env python3
"""
BBK 썸네일 생성기
사용법: python scripts/generate_thumbnail.py --title "성남 주방후드 청소" --region "성남" --item "후드" --bg bg.jpg
"""

import argparse
import os
import base64
import json
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

# ─── 색상 팔레트 ────────────────────────────────────────────────────────
ACCENT_COLORS = {
    'yellow': '#FFE600',
    'red':    '#FF2D2D',
    'pink':   '#FF4FA0',
    'white':  '#FFFFFF',
    'cyan':   '#00E5FF',
    'green':  '#39FF14',
}

ACCENT_TEXT_COLORS = {
    'yellow': '#111111',
    'red':    '#FFFFFF',
    'pink':   '#FFFFFF',
    'white':  '#111111',
    'cyan':   '#111111',
    'green':  '#111111',
}

# ─── 이미지를 base64로 인코딩 ─────────────────────────────────────────
def image_to_data_url(path: str) -> str | None:
    if not path or not os.path.exists(path):
        return None
    ext = Path(path).suffix.lower().lstrip('.')
    mime = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'png': 'image/png', 'webp': 'image/webp',
        'jfif': 'image/jpeg',
    }.get(ext, 'image/jpeg')
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    return f'data:{mime};base64,{b64}'

# ─── 블로그 HTML 템플릿 (1200×630) ──────────────────────────────────
def build_blog_html(title: str, sub: str, region: str, item: str,
                    bg_data_url: str | None, accent: str) -> str:
    accent_color = ACCENT_COLORS.get(accent, '#FFE600')
    text_on_accent = ACCENT_TEXT_COLORS.get(accent, '#111111')
    bg_css = (
        f'background-image: url("{bg_data_url}"); background-size: cover; background-position: center;'
        if bg_data_url
        else 'background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);'
    )
    tag_html = ''
    if region or item:
        tags = [t for t in [region, item] if t]
        tag_html = ''.join(
            f'<span class="tag">{t}</span>' for t in tags
        )
    sub_html = f'<p class="sub">{sub}</p>' if sub else ''

    # 타이틀을 줄바꿈 지점으로 분리 (공백 기준)
    words = title.split()
    if len(words) >= 3:
        mid = len(words) // 2
        line1 = ' '.join(words[:mid])
        line2 = ' '.join(words[mid:])
        title_html = f'{line1}<br>{line2}'
    else:
        title_html = title

    return f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ width: 1200px; height: 630px; overflow: hidden; }}
  .canvas {{
    width: 1200px; height: 630px;
    position: relative;
    {bg_css}
  }}
  .overlay {{
    position: absolute; inset: 0;
    background: linear-gradient(
      105deg,
      rgba(0,0,0,0.82) 0%,
      rgba(0,0,0,0.65) 45%,
      rgba(0,0,0,0.15) 100%
    );
  }}
  .content {{
    position: absolute; inset: 0;
    padding: 50px 60px;
    display: flex; flex-direction: column; justify-content: space-between;
  }}
  .top {{ display: flex; align-items: center; gap: 10px; }}
  .tag {{
    background: {accent_color};
    color: {text_on_accent};
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 700;
    font-size: 22px;
    padding: 6px 18px;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }}
  .middle {{ flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 20px 0; }}
  .title {{
    font-family: 'Black Han Sans', sans-serif;
    font-size: 108px;
    line-height: 1.05;
    color: #FFFFFF;
    letter-spacing: -0.02em;
    text-shadow: 3px 4px 0px rgba(0,0,0,0.4);
  }}
  .title-accent {{ color: {accent_color}; }}
  .sub {{
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 700;
    font-size: 28px;
    color: rgba(255,255,255,0.75);
    margin-top: 16px;
    letter-spacing: 0.02em;
  }}
  .bottom {{ display: flex; justify-content: space-between; align-items: flex-end; }}
  .brand {{
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 900;
    font-size: 20px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }}
  .brand-accent {{ color: {accent_color}; font-size: 24px; }}
  .badge {{
    background: rgba(255,255,255,0.12);
    border: 1.5px solid rgba(255,255,255,0.25);
    color: rgba(255,255,255,0.7);
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 18px;
    padding: 8px 20px;
    border-radius: 30px;
  }}
</style>
</head>
<body>
<div class="canvas">
  <div class="overlay"></div>
  <div class="content">
    <div class="top">{tag_html}</div>
    <div class="middle">
      <div class="title">{title_html}</div>
      {sub_html}
    </div>
    <div class="bottom">
      <div class="brand"><span class="brand-accent">BBK</span> 공간케어</div>
      <div class="badge">전문 청소 서비스</div>
    </div>
  </div>
</div>
</body>
</html>'''

# ─── 인스타 HTML 템플릿 (1080×1080) ─────────────────────────────────
def build_insta_html(title: str, sub: str, region: str, item: str,
                     bg_data_url: str | None, accent: str) -> str:
    accent_color = ACCENT_COLORS.get(accent, '#FFE600')
    text_on_accent = ACCENT_TEXT_COLORS.get(accent, '#111111')
    bg_css = (
        f'background-image: url("{bg_data_url}"); background-size: cover; background-position: center;'
        if bg_data_url
        else 'background: linear-gradient(160deg, #0f3460 0%, #16213e 60%, #1a1a2e 100%);'
    )
    tag_html = ''
    if region or item:
        tags = [t for t in [region, item] if t]
        tag_html = ''.join(
            f'<span class="tag">{t}</span>' for t in tags
        )
    sub_html = f'<p class="sub">{sub}</p>' if sub else ''

    # 인스타는 줄별로 강조 처리 — 두 번째 줄 색상 강조
    words = title.split()
    if len(words) >= 4:
        mid = len(words) // 2
        line1 = ' '.join(words[:mid])
        line2 = ' '.join(words[mid:])
        title_html = f'<span>{line1}</span><br><span class="accent">{line2}</span>'
    elif len(words) >= 2:
        title_html = f'<span>{words[0]}</span><br><span class="accent">{" ".join(words[1:])}</span>'
    else:
        title_html = f'<span class="accent">{title}</span>'

    return f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ width: 1080px; height: 1080px; overflow: hidden; }}
  .canvas {{
    width: 1080px; height: 1080px;
    position: relative;
    {bg_css}
  }}
  .overlay {{
    position: absolute; inset: 0;
    background: linear-gradient(
      180deg,
      rgba(0,0,0,0.2) 0%,
      rgba(0,0,0,0.55) 40%,
      rgba(0,0,0,0.75) 100%
    );
  }}
  .content {{
    position: absolute; inset: 0;
    padding: 60px;
    display: flex; flex-direction: column; justify-content: space-between;
    align-items: center; text-align: center;
  }}
  .top {{ display: flex; gap: 12px; }}
  .tag {{
    background: {accent_color};
    color: {text_on_accent};
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 700;
    font-size: 26px;
    padding: 8px 24px;
    border-radius: 50px;
    letter-spacing: 0.03em;
  }}
  .middle {{ flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }}
  .title {{
    font-family: 'Black Han Sans', sans-serif;
    font-size: 130px;
    line-height: 1.08;
    color: #FFFFFF;
    letter-spacing: -0.01em;
    text-shadow: 4px 5px 0px rgba(0,0,0,0.45);
  }}
  .title .accent {{ color: {accent_color}; }}
  .sub {{
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 700;
    font-size: 30px;
    color: rgba(255,255,255,0.72);
    margin-top: 24px;
    letter-spacing: 0.04em;
  }}
  .bottom {{
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }}
  .divider {{
    width: 60px; height: 3px;
    background: {accent_color};
    border-radius: 2px;
  }}
  .brand {{
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 900;
    font-size: 22px;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.1em;
  }}
  .brand-accent {{ color: {accent_color}; }}
</style>
</head>
<body>
<div class="canvas">
  <div class="overlay"></div>
  <div class="content">
    <div class="top">{tag_html}</div>
    <div class="middle">
      <div class="title">{title_html}</div>
      {sub_html}
    </div>
    <div class="bottom">
      <div class="divider"></div>
      <div class="brand"><span class="brand-accent">BBK</span> 공간케어</div>
    </div>
  </div>
</div>
</body>
</html>'''

# ─── Playwright 스크린샷 ─────────────────────────────────────────────
def take_screenshot(html: str, width: int, height: int, out_path: str) -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.set_content(html, wait_until='networkidle')
        page.screenshot(path=out_path, full_page=False)
        browser.close()
    print(f'  saved: {out_path}')

# ─── 메인 ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='BBK 썸네일 생성기')
    parser.add_argument('--title',  required=True, help='메인 타이틀')
    parser.add_argument('--sub',    default='',    help='서브 텍스트')
    parser.add_argument('--region', default='',    help='지역 태그')
    parser.add_argument('--item',   default='',    help='서비스 품목 태그')
    parser.add_argument('--bg',     default='',    help='배경 이미지 경로')
    parser.add_argument('--type',   default='both', choices=['blog', 'insta', 'both'], help='출력 타입')
    parser.add_argument('--style',  default='bold', choices=['bold', 'poster', 'clean'], help='레이아웃 스타일')
    parser.add_argument('--color',  default='yellow', choices=list(ACCENT_COLORS.keys()), help='강조 색상')
    parser.add_argument('--out',    default='thumbnails', help='출력 디렉토리')
    args = parser.parse_args()

    # 출력 디렉토리 준비
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 배경 이미지 인코딩
    bg_data_url = image_to_data_url(args.bg) if args.bg else None
    if args.bg and not bg_data_url:
        print(f'  warn: bg image not found: {args.bg} (using placeholder)')

    # 파일명 접두사
    today = datetime.now().strftime('%Y%m%d')
    prefix_parts = [p for p in [args.region, args.item, today] if p]
    prefix = '_'.join(prefix_parts) if prefix_parts else today

    print(f'\nBBK 썸네일 생성 중...')
    print(f'  title: {args.title}')
    print(f'  style: {args.style} / color: {args.color}')

    # 블로그 생성 (1200×630)
    if args.type in ('blog', 'both'):
        html = build_blog_html(
            args.title, args.sub, args.region, args.item, bg_data_url, args.color
        )
        out_path = str(out_dir / f'{prefix}_blog.png')
        take_screenshot(html, 1200, 630, out_path)

    # 인스타 생성 (1080×1080)
    if args.type in ('insta', 'both'):
        html = build_insta_html(
            args.title, args.sub, args.region, args.item, bg_data_url, args.color
        )
        out_path = str(out_dir / f'{prefix}_insta.png')
        take_screenshot(html, 1080, 1080, out_path)

    print(f'\ndone! output: {out_dir.resolve()}\n')


if __name__ == '__main__':
    main()
