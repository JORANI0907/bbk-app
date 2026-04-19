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


# ─── 캐릭터 포즈 매핑 (Nano Banana image-to-image) ───────────────────────────
CHAR_POSE_MAP = {
    '후드':   'reaching upward with both hands holding a cleaning brush, scrubbing a kitchen hood overhead, dynamic action pose',
    '주방':   'holding cleaning supplies (spray bottle and cloth) with both hands, standing confidently',
    '바닥':   'kneeling down with a mop, wiping a tiled floor, side profile',
    '에어컨': 'holding an air conditioner filter in one hand, inspecting it with focused expression',
    '욕실':   'holding a foam scrubbing brush, crouching slightly as if cleaning tile',
    '유리':   'holding a window squeegee with both hands, wiping a large glass surface',
    '덕트':   'holding an inspection tool, looking upward as if checking ventilation duct',
    '냉장고': 'opening a refrigerator door with one hand, cleaning cloth in the other',
    '외벽':   'holding a pressure washer nozzle, spraying an exterior wall',
    '화장실': 'holding a toilet cleaning wand, standing near a stall with professional posture',
}
CHAR_POSE_DEFAULT = 'standing confidently with cleaning supplies, friendly waving pose'

# ─── 캐릭터 의상 매핑 (color 테마) ────────────────────────────────────────────
CHAR_OUTFIT_MAP = {
    'yellow': 'blue work cap, white gloves, dark navy work uniform with bright yellow accent stripes on sleeves',
    'red':    'blue work cap, white gloves, dark navy work uniform with red accent stripes on sleeves',
    'pink':   'blue work cap, white gloves, dark navy work uniform with pink accent stripes on sleeves',
    'cyan':   'blue work cap, white gloves, light blue work uniform with cyan accent stripes',
    'white':  'blue work cap, white gloves, clean white work uniform with subtle blue trim',
    'green':  'blue work cap, white gloves, dark navy work uniform with neon green accent stripes',
}

# Nano Banana (Gemini 2.5 Flash Image) 모델 이름
NANO_BANANA_MODELS = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview']

# ─── 라이프스타일 씬 매핑 (scene_key → pose + outfit) ────────────────────────
# 청소 아닌 일상 씬. 인스타 라이프스타일 카테고리용.
CHAR_SCENE_MAP = {
    'cafe_morning': (
        'sitting by a cozy cafe window, holding a warm latte cup with both hands, '
        'soft morning sunlight through the window, relaxed and thoughtful expression',
        'beige oversized cardigan over a white tee, casual autumn look',
    ),
    'reading_night': (
        'reading a hardcover book on a comfortable sofa, side profile, '
        'warm table lamp glow, calm and focused expression',
        'navy knit sweater, cozy at-home look',
    ),
    'park_walk': (
        'walking slowly through a park with autumn leaves, holding a takeaway coffee cup, '
        'gentle smile, natural daylight',
        'long beige trench coat, cream scarf, autumn tones',
    ),
    'home_cooking': (
        'stirring a pot on a stovetop with a wooden spoon, steam rising, '
        'happy focused expression, kitchen apron',
        'striped apron over a simple t-shirt, sleeves rolled up',
    ),
    'beach_sunset': (
        'sitting on sand watching sunset over the ocean, relaxed pose, bare feet, '
        'soft golden hour lighting',
        'white linen shirt, rolled-up shorts, straw hat',
    ),
    'workspace_laptop': (
        'working on a laptop at a minimal desk, thoughtful expression, '
        'a small plant and coffee cup on the side, natural window light',
        'soft grey sweater, minimalist clean look',
    ),
    'bookstore_browse': (
        'standing in a cozy bookstore aisle, browsing a book with gentle curiosity, '
        'warm indoor lighting, shelves of books in background',
        'wool coat over turtleneck, autumn library vibe',
    ),
    'morning_stretch': (
        'stretching arms up by a bright bedroom window, peaceful smile, '
        'soft morning light, slow lifestyle mood',
        'oversized white pajamas, relaxed loungewear',
    ),
    'rain_cafe': (
        'seated at a window seat of a cafe watching rain outside, '
        'holding a warm mug, quiet contemplative mood, soft reflections',
        'oversized hoodie in muted tone, cozy rainy-day outfit',
    ),
    'weekend_brunch': (
        'at a brunch table with a plate of pancakes and coffee, happy about to take a bite, '
        'natural daylight, modern cafe setting',
        'soft pastel knit top, casual weekend style',
    ),
}

# 씬별 배경 검색 프롬프트 (Imagen 4용, 캐릭터 포즈와 조화)
SCENE_BG_MAP = {
    'cafe_morning':     'cozy cafe interior with window seat, morning sunlight, warm wood tones, empty seat, no people',
    'reading_night':    'warm cozy living room at night, soft table lamp, bookshelf background, empty sofa, no people',
    'park_walk':        'autumn park pathway with golden leaves, soft natural light, no people in frame',
    'home_cooking':     'modern kitchen interior with stovetop, warm bright lighting, clean countertops, no people',
    'beach_sunset':     'quiet beach with golden sunset sky, calm ocean waves, empty sand, no people',
    'workspace_laptop': 'minimal work desk with plant and coffee cup near window, natural light, no people',
    'bookstore_browse': 'cozy bookstore interior with wooden bookshelves, warm lighting, empty aisle, no people',
    'morning_stretch':  'bright minimalist bedroom with large window, soft curtains, morning sunlight, empty frame',
    'rain_cafe':        'cafe window view with rain streaks on glass, reflective surfaces, warm interior, empty seat',
    'weekend_brunch':   'modern bright cafe brunch setting, wooden table, empty chair, natural daylight, no people',
}


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


def fetch_bg_from_gemini(item: str, scene: str = '') -> str | None:
    # scene 우선: 라이프스타일 씬 배경
    if scene and scene in SCENE_BG_MAP:
        query = SCENE_BG_MAP[scene]
    else:
        query = ITEM_SEARCH_QUERIES.get(item, ITEM_SEARCH_DEFAULT)
    prompt = (
        f'{query}, professional photo, high quality, bright natural lighting, '
        f'clean commercial environment, Korea, no people, no text, photorealistic'
    )
    result = call_gemini_imagen(prompt, aspect='1:1')
    if result:
        print(f'  bg: Gemini Imagen 생성 완료 ({item})')
    return result


def call_nano_banana_edit(base_png_bytes: bytes, prompt: str) -> bytes | None:
    """
    Nano Banana (Gemini 2.5 Flash Image) image-to-image 편집.
    베이스 PNG + 프롬프트 → 편집된 PNG bytes 반환.
    실패 시 None.
    """
    api_key = load_env_key('GEMINI_API_KEY')
    if not api_key:
        return None

    base_b64 = base64.b64encode(base_png_bytes).decode('utf-8')
    body = {
        'contents': [{
            'parts': [
                {'text': prompt},
                {'inlineData': {'mimeType': 'image/png', 'data': base_b64}},
            ]
        }],
        'generationConfig': {'responseModalities': ['IMAGE']},
    }

    for model in NANO_BANANA_MODELS:
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
        try:
            resp = requests.post(url, json=body, timeout=90)
            if resp.status_code == 404:
                continue  # 다음 모델 시도
            resp.raise_for_status()
            data = resp.json()
            parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
            for part in parts:
                inline = part.get('inlineData') or part.get('inline_data')
                if inline and inline.get('data'):
                    return base64.b64decode(inline['data'])
            print(f'  warn: Nano Banana 응답에 이미지 없음 (model: {model})')
            return None
        except Exception as e:
            print(f'  warn: Nano Banana 호출 실패 ({model}): {e}')
            continue

    return None


def generate_character_with_pose(
    char_name: str,
    item: str,
    color: str,
    script_dir: Path,
    scene: str = '',
) -> str | None:
    """
    Nano Banana로 캐릭터 포즈·의상 동적 변형.
    scene 우선: 라이프스타일 씬(CHAR_SCENE_MAP)이 주어지면 item 매핑 무시.
    캐시 히트 시 재사용. 실패 시 기존 정적 방식으로 fallback.
    """
    # scene 모드면 item 무시, scene_key를 캐시 키로 사용
    scene_mode = bool(scene and scene in CHAR_SCENE_MAP)
    if scene_mode:
        item_key = f'scene-{scene}'
    else:
        # 베이스 키워드 정규화 ("후드청소" → "후드")
        item_key = (item or '').replace('청소', '').strip()

    # 1. 캐시 확인
    cache_dir = script_dir / 'characters' / 'cache'
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_name = f'{char_name}_{item_key or "default"}_{color}.png'
    cache_path = cache_dir / cache_name
    if cache_path.exists():
        print(f'  char: 캐시 히트 ({cache_name})')
        return image_to_data_url(str(cache_path))

    # 2. 베이스 PNG 로드 + 크롭
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
    except ImportError as e:
        print(f'  warn: 라이브러리 부족 ({e}) - fallback')
        return get_char_data_url(char_name, script_dir)

    try:
        img = Image.open(char_path).convert('RGBA')
        w, h = img.size
        crop = CHAR_CROP[char_name]
        box = (int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3]))
        cropped = img.crop(box)

        buf_base = io.BytesIO()
        cropped.save(buf_base, format='PNG')
        base_bytes = buf_base.getvalue()
    except Exception as e:
        print(f'  warn: 베이스 크롭 실패: {e}')
        return get_char_data_url(char_name, script_dir)

    # 3. 프롬프트 구성
    if scene_mode:
        scene_pose, scene_outfit = CHAR_SCENE_MAP[scene]
        pose   = scene_pose
        outfit = scene_outfit
    else:
        pose   = CHAR_POSE_MAP.get(item_key, CHAR_POSE_DEFAULT)
        outfit = CHAR_OUTFIT_MAP.get(color, CHAR_OUTFIT_MAP['yellow'])

    prompt = (
        f'Edit this character image. '
        f'CRITICAL: Keep the EXACT same character design — same face, same body proportions, '
        f'same art style, same color palette as the reference. Do not change the character identity. '
        f'Change ONLY the pose and outfit as described below.\n\n'
        f'New pose: {pose}.\n'
        f'New outfit: {outfit}.\n\n'
        f'Output: full body or 3/4 view, high quality commercial illustration, crisp clean edges, '
        f'no text, no logo, no watermark, no other characters.\n\n'
        f'TRANSPARENT BACKGROUND RULES (very important): '
        f'The background must be completely transparent. '
        f'The EMPTY SPACES between body parts (between arms and torso, between legs, '
        f'between head and raised arms, between fingers) MUST also be fully transparent. '
        f'Do NOT fill those gaps with any color, white, gray, or background — they must show through. '
        f'Only the solid parts of the character (body, clothing, tools held) should be opaque. '
        f'Use a checkerboard-style transparency for all negative space.'
    )

    # 4. Nano Banana 호출
    print(f'  char: Nano Banana 편집 중 (pose: {item_key or "default"}, outfit: {color})...')
    edited_bytes = call_nano_banana_edit(base_bytes, prompt)
    if not edited_bytes:
        print('  warn: Nano Banana 실패 - 정적 fallback')
        return get_char_data_url(char_name, script_dir)

    # 5. rembg로 배경 제거 (투명 배경 + 내부 hole 제거)
    #   isnet-general-use: u2net보다 세밀한 엣지/hole 감지 우수
    #   alpha_matting: 팔 사이, 손가락 사이 등 negative space 투명화
    try:
        session = rembg.new_session('isnet-general-use')
        clean_bytes = rembg.remove(
            edited_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=20,
            alpha_matting_erode_size=8,
            post_process_mask=True,
        )
    except Exception as e:
        print(f'  warn: rembg isnet 실패 ({e}) - u2net fallback')
        try:
            clean_bytes = rembg.remove(edited_bytes, post_process_mask=True)
        except Exception as e2:
            print(f'  warn: rembg 완전 실패 ({e2}) - 원본 사용')
            clean_bytes = edited_bytes

    # 6. 캐시 저장
    try:
        with open(cache_path, 'wb') as f:
            f.write(clean_bytes)
        print(f'  char: 캐시 저장 ({cache_name})')
    except Exception as e:
        print(f'  warn: 캐시 저장 실패: {e}')

    b64 = base64.b64encode(clean_bytes).decode('utf-8')
    return f'data:image/png;base64,{b64}'


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
    z-index: 2;
    pointer-events: none;
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
    bottom: 60px;
    right: 100px;
    height: 52%;
    max-width: 48%;
    object-fit: contain;
    object-position: right bottom;
    filter: drop-shadow(4px 4px 14px rgba(0,0,0,0.45));
    z-index: 1;
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
    parser.add_argument('--scene',  default='',    choices=[''] + list(CHAR_SCENE_MAP.keys()), help='라이프스타일 씬 (item 무시)')
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
        result = fetch_bg_from_gemini(key, scene=args.scene) or fetch_bg_from_pexels(key)
        if not result:
            print('  warn: 배경 생성 실패 - 플레이스홀더 사용')
        bg_path = result or ''
        if result:
            tmp_files.append(result)

    bg_data_url = image_to_data_url(bg_path) if bg_path else None

    # 캐릭터 처리 (Nano Banana 동적 포즈/의상 → 실패 시 정적 fallback)
    char_data_url = None
    if args.char:
        script_dir = Path(__file__).parent
        char_data_url = generate_character_with_pose(
            args.char, args.item, args.color, script_dir, scene=args.scene
        )
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
