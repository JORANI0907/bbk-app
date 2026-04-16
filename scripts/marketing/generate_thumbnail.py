#!/usr/bin/env python3
"""
BBK 썸네일 생성기 — 1:1 단일 출력
사용법: python scripts/marketing/generate_thumbnail.py --title "성남 주방후드 청소" --region "성남" --item "후드" --bg auto --char 라니
"""

import argparse
import os
import base64
import json
import tempfile
import requests
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

# ─── 캐릭터 디스크립터 ─────────────────────────────────────────────────
CHAR_FILES = {
    '라니':  'characters/라니_캐릭터_포트폴리오.png',
    '둥이':  'characters/둥이_캐릭터_포트폴리오.png',
    '조라니': 'characters/조라니_캐릭터.png',
}

# 포트폴리오 이미지에서 정면 컷만 크롭 (비율 기준)
CHAR_CROP = {
    '라니':  (0, 0, 0.38, 0.85),
    '둥이':  (0, 0, 0.38, 0.85),
    '조라니': (0.33, 0, 1.0, 0.80),
}

# ─── 품목별 배경 검색어 매핑 ───────────────────────────────────────────
ITEM_SEARCH_QUERIES = {
    '후드':   'commercial kitchen hood exhaust cleaning restaurant',
    '주방':   'commercial kitchen restaurant interior stainless steel',
    '바닥':   'commercial floor cleaning restaurant kitchen tile',
    '에어컨': 'air conditioner unit cleaning indoor',
    '욕실':   'bathroom cleaning tile professional',
    '유리':   'window glass cleaning commercial building',
    '외벽':   'building exterior wall cleaning pressure wash',
    '덕트':   'ventilation duct cleaning commercial',
    '냉장고': 'commercial refrigerator cleaning kitchen',
    '화장실': 'restroom toilet cleaning commercial',
}
ITEM_SEARCH_DEFAULT = 'professional cleaning service commercial'


def load_env_key(key_name: str) -> str:
    env_path = Path(__file__).parents[2] / '.env.local'
    if env_path.exists():
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith(f'{key_name}='):
                    return line.split('=', 1)[1].strip().strip('"\'')
    return os.environ.get(key_name, '')


def call_gemini_imagen(prompt: str, aspect: str = '1:1') -> str | None:
    api_key = load_env_key('GEMINI_API_KEY')
    if not api_key:
        print('  warn: GEMINI_API_KEY 없음 — .env.local 확인')
        return None
    url = (
        'https://generativelanguage.googleapis.com/v1beta/models/'
        f'imagen-4.0-generate-001:predict?key={api_key}'
    )
    body = {
        'instances': [{'prompt': prompt}],
        'parameters': {'sampleCount': 1, 'aspectRatio': aspect},
    }
    try:
        resp = requests.post(url, json=body, timeout=30)
        resp.raise_for_status()
        b64 = resp.json()['predictions'][0]['bytesBase64Encoded']
        img = base64.b64decode(b64)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp.write(img)
        tmp.close()
        return tmp.name
    except Exception as e:
        print(f'  warn: Gemini Imagen error: {e}')
        return None


def fetch_bg_from_gemini(item: str) -> str | None:
    query = ITEM_SEARCH_QUERIES.get(item, ITEM_SEARCH_DEFAULT)
    prompt = (
        f'{query}, professional photo, high quality, bright natural lighting, '
        f'clean commercial environment, Korea, no people, no text, photorealistic'
    )
    result = call_gemini_imagen(prompt, aspect='1:1')
    if result:
        print(f'  bg: Gemini Imagen 생성 완료 ({item})')
    return result


def get_char_data_url(char_name: str, script_dir: Path) -> str | None:
    char_rel = CHAR_FILES.get(char_name)
    if not char_rel:
        return None
    char_path = script_dir / char_rel
    if not char_path.exists():
        print(f'  warn: 캐릭터 파일 없음: {char_path}')
        return None

    try:
        from PIL import Image
        import io
        import rembg

        img = Image.open(char_path).convert('RGBA')
        w, h = img.size
        crop = CHAR_CROP[char_name]
        box = (int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3]))
        cropped = img.crop(box)

        # rembg로 배경 제거
        buf_in = io.BytesIO()
        cropped.save(buf_in, format='PNG')
        buf_out = io.BytesIO(rembg.remove(buf_in.getvalue()))
        removed = Image.open(buf_out).convert('RGBA')

        buf_final = io.BytesIO()
        removed.save(buf_final, format='PNG')
        b64 = base64.b64encode(buf_final.getvalue()).decode('utf-8')
        print(f'  char: {char_name} 배경 제거 완료')
        return f'data:image/png;base64,{b64}'

    except Exception as e:
        print(f'  warn: 캐릭터 배경 제거 실패: {e}')
        return None


def fetch_bg_from_pexels(item: str) -> str | None:
    api_key = load_env_key('PEXELS_API_KEY')
    if not api_key:
        return None
    query = ITEM_SEARCH_QUERIES.get(item, ITEM_SEARCH_DEFAULT)
    url = 'https://api.pexels.com/v1/search'
    params = {'query': query, 'per_page': 5, 'orientation': 'square'}
    headers = {'Authorization': api_key}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        photos = resp.json().get('photos', [])
        if not photos:
            return None
        photo_url = photos[0]['src']['large2x']
        img_resp = requests.get(photo_url, timeout=20)
        img_resp.raise_for_status()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
        tmp.write(img_resp.content)
        tmp.close()
        print(f'  bg: Pexels fallback ({query})')
        return tmp.name
    except Exception as e:
        print(f'  warn: Pexels error: {e}')
        return None


def image_to_data_url(path: str) -> str | None:
    if not path or not os.path.exists(path):
        return None
    ext = Path(path).suffix.lower().lstrip('.')
    mime = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'png': 'image/png', 'webp': 'image/webp',
    }.get(ext, 'image/jpeg')
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    return f'data:{mime};base64,{b64}'


# ─── 1:1 HTML 템플릿 (1080×1080) ─────────────────────────────────────
def build_html(title: str, sub: str, region: str, item: str,
               bg_data_url: str | None, accent: str,
               char_data_url: str | None = None) -> str:
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
        tag_html = ''.join(f'<span class="tag">{t}</span>' for t in tags)

    sub_html = f'<p class="sub">{sub}</p>' if sub else ''

    words = title.split()
    if len(words) >= 4:
        mid = len(words) // 2
        title_html = f'<span>{" ".join(words[:mid])}</span><br><span class="accent">{" ".join(words[mid:])}</span>'
    elif len(words) >= 2:
        title_html = f'<span>{words[0]}</span><br><span class="accent">{" ".join(words[1:])}</span>'
    else:
        title_html = f'<span class="accent">{title}</span>'

    char_img = f'<img class="character" src="{char_data_url}">' if char_data_url else ''

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
      rgba(0,0,0,0.10) 0%,
      rgba(0,0,0,0.30) 50%,
      rgba(0,0,0,0.50) 100%
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
    font-size: 28px;
    padding: 8px 26px;
    border-radius: 50px;
    letter-spacing: 0.03em;
  }}
  .middle {{
    flex: 1; display: flex; flex-direction: column;
    justify-content: center; align-items: center;
  }}
  .title {{
    font-family: 'Black Han Sans', sans-serif;
    font-size: 170px;
    line-height: 1.05;
    color: {accent_color};
    letter-spacing: -0.01em;
    text-shadow: 5px 6px 0px rgba(0,0,0,0.5);
  }}
  .title .accent {{ color: #FFFFFF; }}
  .sub {{
    font-family: 'Noto Sans KR', sans-serif;
    font-weight: 700;
    font-size: 30px;
    color: rgba(255,255,255,0.85);
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
  .character {{
    position: absolute;
    bottom: 0;
    right: 30px;
    height: 55%;
    object-fit: contain;
    object-position: bottom;
    filter: drop-shadow(4px 4px 14px rgba(0,0,0,0.45));
  }}
</style>
</head>
<body>
<div class="canvas">
  <div class="overlay"></div>
  {char_img}
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


def take_screenshot(html: str, out_path: str) -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 1080, 'height': 1080})
        page.set_content(html, wait_until='networkidle')
        page.screenshot(path=out_path, full_page=False)
        browser.close()
    print(f'  saved: {out_path}')


def main() -> None:
    parser = argparse.ArgumentParser(description='BBK 썸네일 생성기 (1:1)')
    parser.add_argument('--title',  required=True, help='메인 타이틀')
    parser.add_argument('--sub',    default='',    help='서브 텍스트')
    parser.add_argument('--region', default='',    help='지역 태그')
    parser.add_argument('--item',   default='',    help='서비스 품목 태그')
    parser.add_argument('--bg',     default='',    help='배경 이미지 경로 또는 "auto"')
    parser.add_argument('--char',   default='',    choices=['', '라니', '둥이', '조라니'], help='캐릭터')
    parser.add_argument('--style',  default='bold', choices=['bold', 'vintage', 'scatter', 'clean'])
    parser.add_argument('--color',  default='yellow', choices=list(ACCENT_COLORS.keys()))
    parser.add_argument('--out',    default='thumbnails', help='출력 디렉토리')
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f'\nBBK 썸네일 생성 중... (1080x1080)')
    print(f'  title: {args.title}')
    print(f'  style: {args.style} / color: {args.color}')

    tmp_files: list[str] = []

    # 배경 처리
    bg_path = args.bg
    if bg_path == 'auto':
        key = args.item or args.title.split()[0]
        result = fetch_bg_from_gemini(key) or fetch_bg_from_pexels(key)
        if not result:
            print('  warn: 배경 생성 실패 - 플레이스홀더 사용')
        bg_path = result or ''
        if result:
            tmp_files.append(result)

    bg_data_url = image_to_data_url(bg_path) if bg_path else None

    # 캐릭터 처리 (로컬 PNG 크롭 + rembg 배경 제거)
    char_data_url = None
    if args.char:
        script_dir = Path(__file__).parent
        char_data_url = get_char_data_url(args.char, script_dir)
        if not char_data_url:
            print(f'  warn: 캐릭터 처리 실패 ({args.char})')

    # 파일명
    today = datetime.now().strftime('%Y%m%d')
    prefix_parts = [p for p in [args.region, args.item, today] if p]
    prefix = '_'.join(prefix_parts) if prefix_parts else today

    html = build_html(
        args.title, args.sub, args.region, args.item,
        bg_data_url, args.color, char_data_url
    )
    out_path = str(out_dir / f'{prefix}.png')
    take_screenshot(html, out_path)

    print(f'\ndone! output: {out_dir.resolve()}\n')

    for tmp in tmp_files:
        if os.path.exists(tmp):
            os.unlink(tmp)


if __name__ == '__main__':
    main()
