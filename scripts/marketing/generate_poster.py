#!/usr/bin/env python3
"""
BBK 정보형 포스터 생성기 (HTML + Playwright 렌더링)

Phase 1 원칙 준수:
  - 텍스트는 HTML/CSS로 합성 (Imagen에 한글 넣지 않음)
  - Playwright Chromium 헤드리스로 PNG 스크린샷
  - 캐릭터: Nano Banana (Gemini 2.5 Flash Image) image-to-image

사용법:
  # 기존 (환불 규정 고정 템플릿)
  python generate_poster.py --template refund --out ./poster.png

  # 신규 BBK 포스터 스타일 (캐릭터 포함)
  python generate_poster.py --bbk checklist \
    --content content.json --platform danggeun --char 라니 --out ./outputs/posters/

콘텐츠 JSON 포맷: poster_content_example.json 참고
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from datetime import datetime
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright


# ─── 플랫폼 사이즈 프리셋 ────────────────────────────────────────────────────
PLATFORM_PRESETS: dict[str, dict] = {
    "insta":         {"width": 1080, "height": 1350, "label": "인스타그램 4:5"},
    "insta_story":   {"width": 1080, "height": 1920, "label": "인스타그램 스토리 9:16"},
    "danggeun":      {"width": 1080, "height": 1080, "label": "당근마켓 1:1"},
    "smartplace":    {"width": 1080, "height": 1080, "label": "스마트플레이스 1:1"},
    "homepage":      {"width": 1080, "height": 1600, "label": "홈페이지 세로 카드"},
    "homepage_wide": {"width": 1920, "height": 1080, "label": "홈페이지 배너 16:9"},
    "kakao":         {"width": 1080, "height": 1080, "label": "카카오비즈 1:1"},
    "blog":          {"width": 1080, "height": 1350, "label": "블로그 4:5"},
}

# 기존 aspect ratio 호환 유지
ASPECT_SIZES: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1":  (1080, 1080),
    "16:9": (1920, 1080),
    "4:5":  (1080, 1350),
}

# ─── BBK 디자인 토큰 ─────────────────────────────────────────────────────────
BBK = {
    "navy":       "#0D2B5E",
    "navy_mid":   "#1B3A6B",
    "navy_light": "#2A5298",
    "accent":     "#2196F3",
    "yellow":     "#FFD600",
    "bg":         "#EEF2F7",
    "text":       "#0D1F3C",
    "text_sub":   "#546278",
}

# ─── 캐릭터 설정 ─────────────────────────────────────────────────────────────
CHAR_FILES: dict[str, str] = {
    "라니":   "characters/라니_캐릭터_포트폴리오.png",
    "둥이":   "characters/둥이_캐릭터_포트폴리오.png",
    "조라니": "characters/조라니_캐릭터.png",
}
CHAR_CROP: dict[str, tuple] = {
    "라니":   (0, 0, 0.38, 0.85),
    "둥이":   (0, 0, 0.38, 0.85),
    "조라니": (0.33, 0, 1.0, 0.80),
}
NANO_BANANA_MODELS = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"]

POSTER_POSES: dict[str, str] = {
    "regulation":    "standing professionally upright, holding a clipboard, friendly authoritative posture",
    "checklist":     "standing confidently, one hand thumbs up, other hand holding checklist clipboard",
    "announcement":  "holding megaphone in one hand, excited cheerful announcement pose",
    "service":       "holding cleaning supplies with both hands, welcoming professional posture",
    "event":         "arms raised in celebration, big smile, festive cheerful pose",
    "info":          "standing with pointer stick, presenting informative expression",
    "default":       "standing confidently with friendly wave, professional cleaning uniform",
}
POSTER_OUTFIT = (
    "blue work cap, white gloves, dark navy work uniform "
    "with light blue accent stripes, BBK logo patch on chest"
)


# ─── 유틸 ────────────────────────────────────────────────────────────────────
def load_env_key(key_name: str) -> str:
    env_path = Path(__file__).parents[2] / ".env.local"
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key_name}="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    return os.environ.get(key_name, "")


def image_to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


# ─── Nano Banana 캐릭터 생성 ─────────────────────────────────────────────────
def _call_nano_banana(base_bytes: bytes, prompt: str) -> bytes | None:
    api_key = load_env_key("GEMINI_API_KEY")
    if not api_key:
        return None
    body = {
        "contents": [{"parts": [
            {"text": prompt},
            {"inlineData": {"mimeType": "image/png",
                            "data": base64.b64encode(base_bytes).decode()}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    for model in NANO_BANANA_MODELS:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        )
        try:
            resp = requests.post(url, json=body, timeout=90)
            if resp.status_code == 404:
                continue
            resp.raise_for_status()
            parts = (resp.json()
                     .get("candidates", [{}])[0]
                     .get("content", {})
                     .get("parts", []))
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
        except Exception as e:
            print(f"  warn: Nano Banana 실패 ({model}): {e}")
    return None


def generate_poster_character(char_name: str, pose_key: str, script_dir: Path) -> str | None:
    """캐릭터 PNG를 포스터용 포즈로 편집 후 data URL 반환. 캐시 우선."""
    cache_dir = script_dir / "characters" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{char_name}_poster_{pose_key}.png"

    if cache_file.exists():
        print(f"  char: 캐시 히트 ({cache_file.name})")
        return image_to_data_url(str(cache_file))

    char_path = script_dir / CHAR_FILES.get(char_name, "")
    if not char_path.exists():
        print(f"  warn: 캐릭터 파일 없음: {char_path}")
        return None

    try:
        import io

        import rembg
        from PIL import Image

        img = Image.open(char_path).convert("RGBA")
        w, h = img.size
        c = CHAR_CROP[char_name]
        box = (int(w * c[0]), int(h * c[1]), int(w * c[2]), int(h * c[3]))
        buf = io.BytesIO()
        img.crop(box).save(buf, format="PNG")
        base_bytes = buf.getvalue()
    except Exception as e:
        print(f"  warn: 크롭 실패: {e}")
        return image_to_data_url(str(char_path))

    pose = POSTER_POSES.get(pose_key, POSTER_POSES["default"])
    prompt = (
        "Edit this character image to create a professional infographic mascot poster character.\n\n"
        "CRITICAL — Identity preservation (do NOT change these):\n"
        "- Keep EXACT same character: same face shape, eye style, body proportions, fur/skin color\n"
        "- Keep the original 3D cartoon illustration art style with smooth cel shading\n"
        "- Keep the same cute, friendly, professional personality\n"
        "- Change ONLY the pose, gesture, and clothing\n\n"
        f"New pose & gesture: {pose}.\n"
        f"Clothing to apply: {POSTER_OUTFIT}.\n\n"
        "Composition requirements:\n"
        "- Full body from head to toe, character vertically centered\n"
        "- Leave generous blank space ABOVE the head (at least 25% of total image height)\n"
        "- Character faces slightly toward viewer (3/4 view or front-facing)\n"
        "- Dynamic, expressive pose — conveys professionalism, warmth, and energy\n"
        "- Hands/arms should be clearly visible and expressive\n\n"
        "Output quality requirements:\n"
        "- High quality 3D cartoon illustration, clean smooth shading\n"
        "- Crisp, clean edges — no blur or soft edges on the character silhouette\n"
        "- Absolutely NO text, labels, watermarks, speech bubbles, or overlays\n"
        "- FULLY TRANSPARENT BACKGROUND (alpha channel = 0) for ALL non-character pixels:\n"
        "  * All space around the body silhouette\n"
        "  * Space between legs, between arms and torso, inside loop shapes\n"
        "  * No ground shadow, floor reflection, or drop shadow\n"
        "  * No decorative elements, sparkles, or background shapes"
    )

    print(f"  char: Nano Banana 편집 중 (pose={pose_key})...")
    edited = _call_nano_banana(base_bytes, prompt)
    if not edited:
        print("  warn: Nano Banana 실패 — 원본 사용")
        return image_to_data_url(str(char_path))

    try:
        session = rembg.new_session("isnet-general-use")
        clean = rembg.remove(
            edited, session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=20,
            alpha_matting_erode_size=8,
            post_process_mask=True,
        )
    except Exception:
        try:
            clean = rembg.remove(edited, post_process_mask=True)
        except Exception:
            clean = edited

    cache_file.write_bytes(clean)
    print(f"  char: 캐시 저장 ({cache_file.name})")
    return f"data:image/png;base64,{base64.b64encode(clean).decode()}"


# ─── 공통 CSS ─────────────────────────────────────────────────────────────────
_GOOGLE_FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Black+Han+Sans&"
    "family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap"
)

_BRAND_BASE = '''
:root {
  --brand-blue: #2BA6F2;
  --brand-navy: #1A3A5C;
  --brand-dark: #111111;
  --brand-gray: #F5F5F5;
  --ok: #22C55E;
  --warn: #F59E0B;
  --danger: #EF4444;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%;
  font-family: 'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--brand-dark);
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
}
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
'''


def _bbk_base_css(w: int, h: int) -> str:
    return f"""
@import url('{_GOOGLE_FONTS}');
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  width: {w}px; height: {h}px;
  font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;
  background: {BBK['bg']};
  overflow: hidden; position: relative;
  -webkit-font-smoothing: antialiased;
}}
.poster {{ position: relative; width: 100%; height: 100%; }}
.header {{
  background: linear-gradient(135deg, {BBK['navy']} 0%, {BBK['navy_mid']} 100%);
  padding: 28px 44px;
  display: flex; align-items: center; justify-content: space-between;
}}
.logo {{ font-family: 'Black Han Sans'; color: white; font-size: 26px; letter-spacing: 1.5px; line-height: 1.2; }}
.logo-sub {{ color: rgba(255,255,255,0.6); font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin-top: 3px; }}
.header-badge {{
  background: rgba(255,255,255,0.18); color: white;
  border: 1px solid rgba(255,255,255,0.3); border-radius: 30px;
  padding: 6px 18px; font-size: 13px; font-weight: 600;
}}
.character-wrap {{
  position: absolute; right: 24px; z-index: 10;
  filter: drop-shadow(4px 8px 20px rgba(0,0,0,0.28));
}}
.character-wrap img {{ width: 100%; height: auto; display: block; }}
.footer {{
  position: absolute; bottom: 0; left: 0; right: 0;
  background: linear-gradient(135deg, {BBK['navy']} 0%, {BBK['navy_mid']} 100%);
  padding: 22px 44px;
  display: flex; align-items: center; justify-content: space-between;
}}
.footer-info {{ color: rgba(255,255,255,0.85); font-size: 15px; font-weight: 500; }}
.footer-web {{ color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 2px; }}
.footer-logo {{ font-family: 'Black Han Sans'; color: white; font-size: 22px; }}
"""


# ─── BBK 템플릿: 체크리스트 ──────────────────────────────────────────────────
def build_bbk_checklist(content: dict, char_url: str | None, preset: dict) -> str:
    w, h = preset["width"], preset["height"]
    is_square = h <= w

    title     = content.get("title", "")
    subtitle  = content.get("subtitle", "")
    sections  = content.get("sections", [])
    warning   = content.get("warning", "")
    cta       = content.get("cta", {})
    badge     = content.get("badge", "")
    hero_msg  = content.get("hero_msg", "")
    char_msg  = content.get("char_msg", "")

    title_fs = 62 if len(title) <= 8 else 50 if len(title) <= 12 else 42
    char_w   = int(w * (0.36 if is_square else 0.40))
    char_top = 130
    cpr      = char_w + 16 if char_url else 44   # content-padding-right

    s_colors = [BBK["navy_mid"], "#1565C0", "#2E7D32", "#E65100", "#6A1B9A", "#00838F"]
    s_icons  = ["✅", "📌", "⚠️", "💡", "🔹", "🎯"]

    items_html = ""
    for si, sec in enumerate(sections):
        color = sec.get("color", s_colors[si % len(s_colors)])
        icon  = sec.get("icon", s_icons[si % len(s_icons)])
        if sec.get("label"):
            items_html += (
                f'<div style="display:flex;align-items:center;gap:10px;'
                f'background:{color};border-radius:14px;'
                f'padding:11px 18px;margin:16px 0 10px;">'
                f'<span style="font-size:22px;">{icon}</span>'
                f'<span style="font-size:15px;font-weight:800;color:white;letter-spacing:0.5px;">'
                f'{sec["label"]}</span></div>'
            )
        for txt in sec.get("items", []):
            items_html += f"""
            <div style="display:flex;align-items:flex-start;gap:14px;background:white;
              border-radius:14px;padding:15px 18px;margin-bottom:9px;
              box-shadow:0 2px 10px rgba(0,0,0,0.06);border-left:5px solid {color};">
              <div style="width:30px;height:30px;border-radius:50%;background:{color};
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:15px;font-weight:900;flex-shrink:0;">✓</div>
              <span style="font-size:16px;font-weight:500;color:{BBK['text']};line-height:1.55;">{txt}</span>
            </div>"""

    warning_html = (
        f"""<div style="background:#FFF8E1;border:1.5px solid #FFD54F;border-radius:12px;
          padding:14px 18px;margin:0 44px 12px;font-size:15px;color:#7B4F00;
          display:flex;align-items:center;gap:12px;font-weight:500;">
          <span style="font-size:20px;flex-shrink:0">⚠️</span><span>{warning}</span></div>"""
        if warning else ""
    )
    cta_html = (
        f"""<div style="background:{BBK['navy_mid']};border-radius:16px;padding:16px 22px;
          margin:0 44px 12px;display:flex;align-items:center;gap:14px;">
          <span style="font-size:26px;flex-shrink:0;">📞</span>
          <div>
            <div style="color:white;font-size:19px;font-weight:700;">{cta.get('text','')}</div>
            <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:2px;">{cta.get('website','')}</div>
          </div></div>"""
        if cta.get("text") else ""
    )
    char_html = (
        f'<div class="character-wrap" style="top:{char_top}px;width:{char_w}px;">'
        f'<img src="{char_url}" alt="char"></div>'
        if char_url else ""
    )
    speech_html = ""
    if char_url and char_msg:
        bubble_right = cpr + 8
        bubble_top   = char_top + int(char_w * 0.3)
        speech_html = (
            f'<div style="position:absolute;right:{bubble_right}px;top:{bubble_top}px;z-index:12;'
            f'background:white;border-radius:16px 16px 0 16px;padding:11px 15px;max-width:210px;'
            f'box-shadow:0 4px 20px rgba(0,0,0,0.16);border:2.5px solid {BBK["navy_mid"]};">'
            f'<div style="font-size:13px;font-weight:600;color:{BBK["navy"]};line-height:1.55;">'
            f'{char_msg}</div></div>'
        )
    hero_html = (
        f'<div style="background:linear-gradient(90deg,{BBK["navy"]} 0%,{BBK["navy_light"]} 100%);'
        f'padding:15px 44px;padding-right:{cpr}px;display:flex;align-items:center;gap:12px;">'
        f'<span style="font-size:18px;flex-shrink:0;">💬</span>'
        f'<span style="color:white;font-size:15px;font-weight:700;line-height:1.4;">{hero_msg}</span></div>'
        if hero_msg else ""
    )

    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
{_bbk_base_css(w, h)}
.title-area {{
  background:white; padding:28px 44px 22px; padding-right:{cpr}px;
  border-bottom:4px solid {BBK['navy_mid']};
}}
.main-title {{ font-family:'Black Han Sans'; font-size:{title_fs}px; color:{BBK['text']}; line-height:1.2; margin-bottom:6px; }}
.subtitle {{ font-size:16px; color:{BBK['text_sub']}; font-weight:500; }}
.content-area {{ padding:16px 44px 100px; padding-right:{cpr}px; overflow:hidden; }}
</style></head><body>
<div class="poster">
  <div class="header">
    <div><div class="logo">BUMBUILDKOREA</div><div class="logo-sub">범빌드코리아</div></div>
    {f'<div class="header-badge">{badge}</div>' if badge else ''}
  </div>
  {char_html}
  {speech_html}
  {hero_html}
  <div class="title-area">
    <div class="main-title">「{title}」</div>
    {f'<div class="subtitle">{subtitle}</div>' if subtitle else ''}
  </div>
  <div class="content-area">{items_html}</div>
  {warning_html}{cta_html}
  <div class="footer">
    <div><div class="footer-info">📞 {cta.get('text','031-759-4877')}</div>
    <div class="footer-web">{cta.get('website','bbkorea.co.kr')}</div></div>
    <div class="footer-logo">BBK</div>
  </div>
</div></body></html>"""


# ─── BBK 템플릿: 단계형 ──────────────────────────────────────────────────────
def build_bbk_steps(content: dict, char_url: str | None, preset: dict) -> str:
    w, h = preset["width"], preset["height"]
    is_square = h <= w

    title   = content.get("title", "")
    subtitle = content.get("subtitle", "")
    steps   = content.get("steps", [])
    note    = content.get("note", "")
    cta     = content.get("cta", {})
    badge   = content.get("badge", "")

    title_fs = 56 if len(title) <= 10 else 46
    char_w   = int(w * (0.35 if is_square else 0.38))
    char_top = 120
    cpr      = char_w + 16 if char_url else 44

    s_colors = [BBK["navy_mid"], "#1565C0", "#2E7D32", "#E65100", "#6A1B9A", "#00838F"]

    steps_html = ""
    for i, step in enumerate(steps):
        color = step.get("color", s_colors[i % len(s_colors)])
        is_last = i == len(steps) - 1
        steps_html += f"""
        <div style="position:relative;display:flex;align-items:flex-start;gap:18px;
          background:white;border-radius:16px;padding:18px 20px;margin-bottom:{'10px' if is_last else '22px'};
          box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          <div style="width:44px;height:44px;border-radius:50%;background:{color};flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            color:white;font-family:'Black Han Sans';font-size:22px;">{i+1}</div>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
              color:{color};margin-bottom:4px;">{step.get('label', f'STEP {i+1}')}</div>
            <div style="font-size:17px;font-weight:600;color:{BBK['text']};line-height:1.4;">
              {step.get('text','')}</div>
            {f'<div style="font-size:14px;color:{BBK["text_sub"]};margin-top:4px;line-height:1.5;">{step["sub"]}</div>' if step.get('sub') else ''}
          </div>
        </div>
        {f'<div style="text-align:left;padding-left:58px;margin-top:-18px;margin-bottom:4px;font-size:20px;color:{color};font-weight:900;">↓</div>' if not is_last else ''}
        """

    char_html = (
        f'<div class="character-wrap" style="top:{char_top}px;width:{char_w}px;">'
        f'<img src="{char_url}" alt="char"></div>'
        if char_url else ""
    )
    note_html = (
        f"""<div style="background:{BBK['navy_mid']};border-radius:14px;padding:14px 20px;
          margin:0 44px 12px;color:white;font-size:15px;font-weight:500;line-height:1.6;
          display:flex;align-items:center;gap:12px;">
          <span style="font-size:20px;flex-shrink:0;">💡</span><span>{note}</span></div>"""
        if note else ""
    )

    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
{_bbk_base_css(w, h)}
.title-area {{ background:white; padding:30px 44px 26px; padding-right:{cpr}px;
  border-bottom:5px solid {BBK['navy_mid']}; }}
.main-title {{ font-family:'Black Han Sans'; font-size:{title_fs}px; color:{BBK['text']}; line-height:1.2; margin-bottom:8px; }}
.subtitle {{ font-size:16px; color:{BBK['text_sub']}; font-weight:500; }}
.content-area {{ padding:20px 44px 100px; padding-right:{cpr}px; overflow:hidden; }}
</style></head><body>
<div class="poster">
  <div class="header">
    <div><div class="logo">BUMBUILLD KOREA</div><div class="logo-sub">범빌드코리아</div></div>
    {f'<div class="header-badge">{badge}</div>' if badge else ''}
  </div>
  {char_html}
  <div class="title-area">
    <div class="main-title">「{title}」</div>
    {f'<div class="subtitle">{subtitle}</div>' if subtitle else ''}
  </div>
  <div class="content-area">{steps_html}</div>
  {note_html}
  <div class="footer">
    <div><div class="footer-info">📞 {cta.get('text','031-759-4877')}</div>
    <div class="footer-web">{cta.get('website','bbkorea.co.kr')}</div></div>
    <div class="footer-logo">BBK</div>
  </div>
</div></body></html>"""


# ─── BBK 템플릿: 정보 카드 ────────────────────────────────────────────────────
def build_bbk_info(content: dict, char_url: str | None, preset: dict) -> str:
    w, h = preset["width"], preset["height"]

    title         = content.get("title", "")
    subtitle      = content.get("subtitle", "")
    highlight     = content.get("highlight", "")
    highlight_sub = content.get("highlight_sub", "")
    cards         = content.get("cards", [])
    note          = content.get("note", "")
    cta           = content.get("cta", {})
    badge         = content.get("badge", "")

    title_fs  = 58 if len(title) <= 10 else 46
    char_w    = int(w * 0.40)
    char_top  = 120
    cpr       = char_w + 16 if char_url else 44
    col_count = min(len(cards), 2) if len(cards) > 1 else 1

    s_colors = [BBK["navy_mid"], "#1565C0", "#2E7D32", "#E65100", "#6A1B9A", "#AD1457"]
    cards_html = ""
    for i, card in enumerate(cards):
        color = card.get("color", s_colors[i % len(s_colors)])
        cards_html += f"""
        <div style="background:white;border-radius:16px;padding:20px 18px;
          box-shadow:0 2px 10px rgba(0,0,0,0.07);border-top:5px solid {color};">
          <div style="font-size:28px;margin-bottom:10px;">{card.get('icon','📌')}</div>
          <div style="font-size:15px;font-weight:700;color:{color};margin-bottom:8px;">
            {card.get('title','')}</div>
          <div style="font-size:14px;color:{BBK['text_sub']};line-height:1.6;">
            {card.get('text','')}</div>
        </div>"""

    char_html = (
        f'<div class="character-wrap" style="top:{char_top}px;width:{char_w}px;right:20px;">'
        f'<img src="{char_url}" alt="char"></div>'
        if char_url else ""
    )
    highlight_html = (
        f"""<div style="background:linear-gradient(135deg,{BBK['navy']} 0%,{BBK['navy_light']} 100%);
          padding:28px 44px;text-align:center;padding-right:{cpr}px;">
          <div style="font-family:'Black Han Sans';font-size:72px;color:#FFD600;line-height:1;">
            {highlight}</div>
          <div style="font-size:18px;color:rgba(255,255,255,0.85);margin-top:8px;">
            {highlight_sub}</div></div>"""
        if highlight else ""
    )

    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
{_bbk_base_css(w, h)}
.title-area {{ background:white; padding:30px 44px 26px; padding-right:{cpr}px;
  border-bottom:5px solid {BBK['navy_mid']}; }}
.main-title {{ font-family:'Black Han Sans'; font-size:{title_fs}px; color:{BBK['text']}; line-height:1.2; margin-bottom:8px; }}
.subtitle {{ font-size:16px; color:{BBK['text_sub']}; font-weight:500; }}
.cards-grid {{ display:grid; grid-template-columns:repeat({col_count},1fr);
  gap:14px; padding:22px 44px 100px; padding-right:{cpr}px; overflow:hidden; }}
</style></head><body>
<div class="poster">
  <div class="header">
    <div><div class="logo">BUMBUILLD KOREA</div><div class="logo-sub">범빌드코리아</div></div>
    {f'<div class="header-badge">{badge}</div>' if badge else ''}
  </div>
  {char_html}
  <div class="title-area">
    <div class="main-title">「{title}」</div>
    {f'<div class="subtitle">{subtitle}</div>' if subtitle else ''}
  </div>
  {highlight_html}
  <div class="cards-grid">{cards_html}</div>
  {f'<div style="background:{BBK["navy_mid"]};border-radius:14px;padding:14px 20px;margin:0 44px 12px;color:white;font-size:15px;font-weight:500;display:flex;align-items:center;gap:12px;"><span style=\\"font-size:20px;flex-shrink:0\\">💡</span><span>{note}</span></div>' if note else ''}
  <div class="footer">
    <div><div class="footer-info">📞 {cta.get('text','031-759-4877')}</div>
    <div class="footer-web">{cta.get('website','bbkorea.co.kr')}</div></div>
    <div class="footer-logo">BBK</div>
  </div>
</div></body></html>"""


# ─── BBK 템플릿: 이중 카드 (상황+조치) ──────────────────────────────────────
def build_bbk_detail(content: dict, char_url: str | None, preset: dict) -> str:
    """
    상단 히어로 영역(다크 배경+대형 제목) + 섹션별 발생상황·조치사항 2단 카드.
    캐릭터는 우하단 소형 배치 — 카드와 겹치되 텍스트는 좌측으로 모아 가독성 유지.

    content JSON 필드:
      title, subtitle, badge, hero_msg, char_msg,
      sections: [{label, icon, color, situations:[...], actions:[...]}],
      warning, note, cta
    """
    w, h = preset["width"], preset["height"]

    title    = content.get("title", "")
    subtitle = content.get("subtitle", "")
    badge    = content.get("badge", "")
    hero_msg = content.get("hero_msg", "")
    char_msg = content.get("char_msg", "")
    sections = content.get("sections", [])
    warning  = content.get("warning", "")
    note     = content.get("note", "")
    cta      = content.get("cta", {})

    title_fs = 58 if len(title) <= 9 else 48 if len(title) <= 12 else 40
    # 캐릭터: 우하단 소형 (너비 26%), 본문은 전체 너비 사용
    char_w      = int(w * 0.26)
    char_bottom = 72   # 푸터 위 픽셀
    s_colors = ["#1B3A6B", "#1565C0", "#2E7D32", "#B71C1C", "#6A1B9A", "#00695C"]

    # ── 섹션 카드 (전체 너비, 텍스트 우측 일부 여백으로 캐릭터 겹침 허용)
    # 마지막 1개 카드는 우측 여백을 char_w+8 로 줌
    n = len(sections)
    sections_html = ""
    for si, sec in enumerate(sections):
        color    = sec.get("color", s_colors[si % len(s_colors)])
        icon     = sec.get("icon", "📌")
        label    = sec.get("label", "")
        sits     = sec.get("situations", [])
        acts     = sec.get("actions", [])
        is_last  = si == n - 1
        pr_extra = f"padding-right:{char_w + 12}px;" if char_url and is_last else ""

        sit_items = "".join(
            f'<div style="font-size:14px;color:#4A5568;padding:3px 0 3px 18px;'
            f'position:relative;line-height:1.6;">'
            f'<span style="position:absolute;left:2px;color:{color};font-size:17px;font-weight:900;">·</span>'
            f'{txt}</div>'
            for txt in sits
        )
        act_items = "".join(
            f'<div style="font-size:14px;color:#1A5C1A;font-weight:600;padding:4px 0 4px 26px;'
            f'position:relative;line-height:1.6;">'
            f'<span style="position:absolute;left:0;font-size:13px;">✅</span>{txt}</div>'
            for txt in acts
        )
        sit_block = (
            f'<div style="background:#F0F4FA;padding:11px 18px;{pr_extra}">'
            f'<div style="font-size:10px;font-weight:800;letter-spacing:1.8px;color:#7A8AA0;'
            f'text-transform:uppercase;margin-bottom:7px;">발생 상황</div>{sit_items}</div>'
            f'<div style="height:1px;background:#DDE4EF;"></div>'
        ) if sits else ""
        act_block = (
            f'<div style="background:#E6F4EA;padding:11px 18px;{pr_extra}">'
            f'<div style="font-size:10px;font-weight:800;letter-spacing:1.8px;color:#2E7D32;'
            f'text-transform:uppercase;margin-bottom:7px;">조치 사항</div>{act_items}</div>'
        ) if acts else ""

        sections_html += (
            f'<div style="border-radius:16px;overflow:hidden;margin-bottom:13px;'
            f'box-shadow:0 3px 16px rgba(0,0,0,0.10);">'
            f'<div style="background:{color};padding:13px 20px;'
            f'display:flex;align-items:center;gap:12px;">'
            f'<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.22);'
            f'display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">{icon}</div>'
            f'<span style="font-family:\'Black Han Sans\';font-size:20px;color:white;'
            f'letter-spacing:0.5px;line-height:1.2;">{label}</span></div>'
            f'{sit_block}{act_block}</div>'
        )

    # ── 캐릭터 우하단 + 말풍선
    char_html = speech_html = ""
    if char_url:
        char_html = (
            f'<div style="position:absolute;bottom:{char_bottom}px;right:0;width:{char_w}px;'
            f'z-index:10;filter:drop-shadow(3px 6px 16px rgba(0,0,0,0.22));">'
            f'<img src="{char_url}" alt="char" style="width:100%;height:auto;display:block;"></div>'
        )
        if char_msg:
            # 말풍선: 캐릭터 머리 왼쪽 (우하단에서 위쪽으로)
            bubble_right = char_w + 10
            bubble_bottom = char_bottom + int(char_w * 1.2)
            speech_html = (
                f'<div style="position:absolute;right:{bubble_right}px;bottom:{bubble_bottom}px;'
                f'z-index:12;background:white;border-radius:16px 16px 16px 0;'
                f'padding:11px 15px;max-width:200px;'
                f'box-shadow:0 4px 20px rgba(0,0,0,0.15);border:2.5px solid {BBK["navy_mid"]};">'
                f'<div style="font-size:13px;font-weight:600;color:{BBK["navy"]};line-height:1.55;">'
                f'{char_msg}</div></div>'
            )

    # ── 히어로 영역 (다크 배경 + 대형 제목) — 헤더 바로 아래
    badge_html = (
        f'<div style="display:inline-flex;background:rgba(255,255,255,0.18);'
        f'border:1px solid rgba(255,255,255,0.35);border-radius:30px;'
        f'padding:5px 18px;color:white;font-size:12px;font-weight:700;'
        f'letter-spacing:1.2px;margin-bottom:14px;">{badge}</div><br>'
        if badge else ""
    )
    hero_msg_html = (
        f'<div style="background:rgba(255,255,255,0.10);border-left:4px solid #FFD600;'
        f'border-radius:0 10px 10px 0;padding:12px 16px;color:rgba(255,255,255,0.90);'
        f'font-size:14px;font-weight:600;line-height:1.55;margin-top:14px;">{hero_msg}</div>'
        if hero_msg else ""
    )
    sub_html = (
        f'<div style="font-size:15px;color:rgba(255,255,255,0.72);line-height:1.5;">{subtitle}</div>'
        if subtitle else ""
    )
    hero_area = (
        f'<div style="background:linear-gradient(145deg,{BBK["navy"]} 0%,'
        f'{BBK["navy_mid"]} 55%,{BBK["navy_light"]} 100%);padding:28px 44px 26px;">'
        f'{badge_html}'
        f'<div style="font-size:28px;margin-bottom:10px;">⚠️</div>'
        f'<div style="font-family:\'Black Han Sans\';font-size:{title_fs}px;color:white;'
        f'line-height:1.15;margin-bottom:8px;">{title}</div>'
        f'{sub_html}'
        f'{hero_msg_html}'
        f'</div>'
    )

    warning_html = (
        f'<div style="background:#FFF3E0;border:1.5px solid #FFB74D;border-radius:12px;'
        f'padding:12px 18px;margin:0 44px 10px;font-size:14px;color:#7B4F00;'
        f'display:flex;align-items:center;gap:10px;font-weight:500;">'
        f'<span style="font-size:18px;flex-shrink:0">⚠️</span><span>{warning}</span></div>'
        if warning else ""
    )
    note_html = (
        f'<div style="background:{BBK["navy_mid"]};border-radius:12px;padding:12px 18px;'
        f'margin:0 44px 10px;color:white;font-size:14px;font-weight:500;line-height:1.6;'
        f'display:flex;align-items:center;gap:10px;">'
        f'<span style="font-size:18px;flex-shrink:0;">💡</span><span>{note}</span></div>'
        if note else ""
    )

    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
{_bbk_base_css(w, h)}
.content-area {{ padding:16px 44px 100px; overflow:hidden; }}
</style></head><body>
<div class="poster">
  <div class="header">
    <div><div class="logo">BUMBUILDKOREA</div><div class="logo-sub">범빌드코리아</div></div>
  </div>
  {hero_area}
  <div class="content-area">{sections_html}</div>
  {warning_html}{note_html}
  {char_html}
  {speech_html}
  <div class="footer">
    <div><div class="footer-info">📞 {cta.get('text','031-759-4877')}</div>
    <div class="footer-web">{cta.get('website','bbkorea.co.kr')}</div></div>
    <div class="footer-logo">BBK</div>
  </div>
</div></body></html>"""


BBK_TEMPLATES = {
    "checklist": (build_bbk_checklist, "checklist"),
    "steps":     (build_bbk_steps,     "info"),
    "info":      (build_bbk_info,      "info"),
    "detail":    (build_bbk_detail,    "announcement"),
}


# ─── 기존 환불 규정 템플릿 (원본 유지) ───────────────────────────────────────
BRAND_CSS = _BRAND_BASE

REFUND_DATA: dict = {
    "header": {
        "eyebrow": "예약 전 반드시 확인하세요",
        "title":   "예약금 환불 규정",
        "subtitle": "취소 · 노쇼 · 중도해지 — 상황별 환불 기준",
    },
    "cancel_timeline": [
        {"level": "ok",     "badge": "72시간 전", "sub": "시공일 3일 전", "result": "예약금 전액 환불",  "amount": "80,000원 전액",  "note": "영업일 기준 3일 이내"},
        {"level": "warn",   "badge": "48시간 전", "sub": "시공일 2일 전", "result": "예약금 50% 환불", "amount": "40,000원 환불",  "note": "진행 여부 확인 후 처리"},
        {"level": "danger", "badge": "36시간 이내", "sub": "당일 ~ 36시간", "result": "환불 불가",       "amount": "0원 환불",       "note": "일정 변경 안내 가능"},
    ],
    "noshow": {
        "title": "노쇼(No-Show) 발생 시",
        "lines": [
            "예약금 전액 환불 불가 (100% 위약금)",
            "방문 후 연락 두절 / 입장 거부 시 동일 적용",
            "재예약 시 예약금 선납 필수",
        ],
        "emphasis": "노쇼는 다른 고객의 기회를 빼앗는 행동입니다",
    },
    "subscription": [
        {"level": "ok",     "label": "정상 해지 (사전 통보)", "items": ["해지 신청: 다음 시공일 72시간 전", "남은 기간 일할 계산 환불", "예: 월 99,000원 → 남은 회차 비례 환불"]},
        {"level": "danger", "label": "즉시 해지 (72시간 이내)", "items": ["당월 서비스 비용 전액 청구", "이미 제공된 서비스 환불 불가", "위약금 없음 (단, 잔여 서비스 소멸)"]},
    ],
    "process": [
        "해지/취소 접수 → 카카오톡 또는 전화 문의",
        "환불 금액 확인 → 영업일 기준 1~2일 이내 안내",
        "환불 완료 → 영업일 기준 3~5일 이내 입금",
    ],
    "contact": {"phone1": "010-5434-4877", "phone2": "031-759-4877", "kakao": "BBK 범빌드코리아", "hours": "09:00 ~ 19:00"},
    "footer":  {"logo": "BUMBUILDKOREA", "tagline": "국가 인증 위생관리업 등록 업체", "note": "본 규정은 서비스 약관에 준하며 사전 고지 없이 변경될 수 있습니다"},
}


def _level_color(level: str) -> str:
    return {"ok": "var(--ok)", "warn": "var(--warn)", "danger": "var(--danger)"}.get(level, "var(--brand-blue)")


def _level_icon(level: str) -> str:
    return {"ok": "✓", "warn": "!", "danger": "✕"}.get(level, "•")


def build_refund_html(data: dict) -> str:
    h = data["header"]
    timeline_cards = ""
    for item in data["cancel_timeline"]:
        color = _level_color(item["level"])
        icon  = _level_icon(item["level"])
        timeline_cards += f"""
        <div class="tl-card" style="--lvl:{color}">
          <div class="tl-badge"><span class="tl-icon">{icon}</span>{item['badge']}</div>
          <div class="tl-sub">{item['sub']}</div>
          <div class="tl-result">{item['result']}</div>
          <div class="tl-amount">{item['amount']}</div>
          <div class="tl-note">{item['note']}</div>
        </div>"""
    noshow_lines = "".join(f"<li>{line}</li>" for line in data["noshow"]["lines"])
    sub_cards = ""
    for card in data["subscription"]:
        color = _level_color(card["level"])
        items = "".join(f"<li>{item}</li>" for item in card["items"])
        sub_cards += f'<div class="sub-card" style="--lvl:{color}"><div class="sub-label">{card["label"]}</div><ul>{items}</ul></div>'
    process_steps = ""
    for idx, step in enumerate(data["process"], start=1):
        process_steps += f'<div class="proc-step"><div class="proc-num">{idx}</div><div class="proc-text">{step}</div></div>'
    c  = data["contact"]
    f_ = data["footer"]
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
{BRAND_CSS}
body {{ padding: 64px 56px; }}
.header {{ background: linear-gradient(135deg, var(--brand-navy), var(--brand-blue)); color: white; padding: 48px 40px; border-radius: 24px; text-align: center; margin-bottom: 40px; }}
.header .eyebrow {{ display: inline-block; background: rgba(255,255,255,0.18); padding: 8px 20px; border-radius: 999px; font-size: 22px; font-weight: 600; margin-bottom: 20px; }}
.header h1 {{ font-size: 76px; font-weight: 900; margin-bottom: 12px; letter-spacing: -0.02em; }}
.header .subtitle {{ font-size: 26px; opacity: 0.92; font-weight: 500; }}
.section {{ margin-bottom: 44px; }}
.section-title {{ font-size: 32px; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }}
.section-title::before {{ content: ''; width: 6px; height: 32px; background: var(--brand-blue); border-radius: 3px; }}
.timeline {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }}
.tl-card {{ border: 3px solid var(--lvl); border-radius: 20px; padding: 28px 22px; background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }}
.tl-badge {{ display: inline-flex; align-items: center; gap: 8px; background: var(--lvl); color: white; padding: 8px 18px; border-radius: 999px; font-size: 22px; font-weight: 800; margin-bottom: 14px; }}
.tl-icon {{ width: 28px; height: 28px; border-radius: 50%; background: white; color: var(--lvl); display: inline-flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; }}
.tl-sub {{ color: #666; font-size: 18px; margin-bottom: 14px; }}
.tl-result {{ font-size: 26px; font-weight: 800; color: var(--lvl); margin-bottom: 6px; }}
.tl-amount {{ font-size: 22px; font-weight: 700; margin-bottom: 10px; }}
.tl-note {{ font-size: 16px; color: #888; }}
.noshow {{ background: #FEF2F2; border-left: 8px solid var(--danger); padding: 28px 32px; border-radius: 16px; }}
.noshow-title {{ font-size: 28px; font-weight: 800; margin-bottom: 14px; color: var(--danger); }}
.noshow ul {{ list-style: none; margin-bottom: 16px; }}
.noshow li {{ font-size: 20px; padding-left: 24px; margin-bottom: 8px; position: relative; }}
.noshow li::before {{ content: '•'; color: var(--danger); position: absolute; left: 0; font-weight: 900; }}
.noshow-emph {{ font-weight: 700; color: var(--danger); padding-top: 14px; border-top: 2px dashed #FCA5A5; font-size: 20px; }}
.subscription {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.sub-card {{ border: 3px solid var(--lvl); border-radius: 20px; padding: 28px 24px; background: white; }}
.sub-label {{ color: var(--lvl); font-size: 24px; font-weight: 800; padding-bottom: 12px; border-bottom: 2px solid var(--lvl); margin-bottom: 16px; }}
.sub-card ul {{ list-style: none; }}
.sub-card li {{ font-size: 19px; padding-left: 22px; margin-bottom: 10px; position: relative; }}
.sub-card li::before {{ content: '–'; color: var(--lvl); position: absolute; left: 0; font-weight: 800; }}
.process {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }}
.proc-step {{ background: var(--brand-gray); border-radius: 16px; padding: 24px 20px; text-align: center; }}
.proc-num {{ width: 52px; height: 52px; border-radius: 50%; background: var(--brand-blue); color: white; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 900; margin: 0 auto 12px; }}
.proc-text {{ font-size: 18px; font-weight: 600; line-height: 1.4; }}
.contact {{ background: var(--brand-navy); color: white; padding: 32px 36px; border-radius: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
.contact-item {{ display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 600; }}
.contact-key {{ opacity: 0.7; font-size: 18px; font-weight: 500; }}
.footer {{ margin-top: 36px; padding-top: 24px; border-top: 2px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }}
.footer-logo {{ font-size: 32px; font-weight: 900; color: var(--brand-blue); letter-spacing: 0.02em; }}
.footer-tagline {{ font-size: 16px; color: #666; }}
.footer-note {{ font-size: 14px; color: #999; text-align: right; max-width: 340px; }}
</style></head><body>
<div class="header">
  <div class="eyebrow">{h['eyebrow']}</div>
  <h1>{h['title']}</h1>
  <div class="subtitle">{h['subtitle']}</div>
</div>
<div class="section"><div class="section-title">예약 취소 환불 규정</div><div class="timeline">{timeline_cards}</div></div>
<div class="section"><div class="section-title">{data['noshow']['title']}</div>
  <div class="noshow"><ul>{noshow_lines}</ul><div class="noshow-emph">"{data['noshow']['emphasis']}"</div></div></div>
<div class="section"><div class="section-title">구독 서비스 중도해지</div><div class="subscription">{sub_cards}</div></div>
<div class="section"><div class="section-title">환불 처리 방법</div><div class="process">{process_steps}</div></div>
<div class="contact">
  <div class="contact-item"><span class="contact-key">대표번호</span>{c['phone1']}</div>
  <div class="contact-item"><span class="contact-key">지점번호</span>{c['phone2']}</div>
  <div class="contact-item"><span class="contact-key">카카오톡</span>{c['kakao']}</div>
  <div class="contact-item"><span class="contact-key">운영시간</span>{c['hours']}</div>
</div>
<div class="footer">
  <div><div class="footer-logo">{f_['logo']}</div><div class="footer-tagline">{f_['tagline']}</div></div>
  <div class="footer-note">{f_['note']}</div>
</div>
</body></html>'''


TEMPLATES = {"refund": (build_refund_html, REFUND_DATA)}


# ─── 렌더러 ─────────────────────────────────────────────────────────────────
def render_html(html: str, out_path: str, width: int, height: int) -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": width, "height": height},
            device_scale_factor=2,
        )
        page.set_content(html, wait_until="networkidle")
        page.screenshot(path=out_path, full_page=False)
        browser.close()


def _update_session(char_name: str, script_dir: Path) -> None:
    char_cycle = {"라니": "B", "둥이": "C", "조라니": "A"}
    sp = script_dir / "session.json"
    data = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
    data["last_character"] = char_cycle.get(char_name, "B")
    data["generation_count"] = data.get("generation_count", 0) + 1
    sp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ─── 메인 ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="BBK 포스터 생성기")

    # ── 기존 모드 (--template)
    parser.add_argument("--template", default="", choices=["", *TEMPLATES.keys()],
                        help="기존 고정 템플릿 (refund 등)")
    parser.add_argument("--data",   default="", help="커스텀 JSON 데이터 파일 경로")
    parser.add_argument("--aspect", default="9:16", choices=list(ASPECT_SIZES.keys()),
                        help="비율 (기존 모드용)")

    # ── BBK 포스터 모드 (--bbk)
    parser.add_argument("--bbk",     default="", choices=["", *BBK_TEMPLATES.keys()],
                        help="BBK 포스터 템플릿 (checklist / steps / info)")
    parser.add_argument("--content", default="", help="콘텐츠 JSON 파일 경로 (BBK 모드)")
    parser.add_argument("--title",   default="", help="포스터 제목 (BBK 모드, content.json 우선)")
    parser.add_argument("--platform", default="insta", choices=list(PLATFORM_PRESETS.keys()),
                        help="플랫폼 프리셋 (BBK 모드)")
    parser.add_argument("--char",    default="라니", choices=["라니", "둥이", "조라니"],
                        help="캐릭터 (BBK 모드)")
    parser.add_argument("--pose",    default="", choices=["", *POSTER_POSES.keys()],
                        help="캐릭터 포즈 키 (기본: 템플릿 자동 선택)")
    parser.add_argument("--no-char", action="store_true", help="캐릭터 없이 생성")

    parser.add_argument("--out", required=True, help="출력 경로 (파일 또는 디렉터리)")
    args = parser.parse_args()

    # ── BBK 포스터 모드
    if args.bbk:
        preset  = PLATFORM_PRESETS[args.platform]
        content: dict = {}
        if args.content and Path(args.content).exists():
            content = json.loads(Path(args.content).read_text(encoding="utf-8"))
        if args.title:
            content.setdefault("title", args.title)

        print(f"BBK 포스터 생성... ({preset['label']} {preset['width']}×{preset['height']})")

        script_dir = Path(__file__).parent
        builder_fn, default_pose = BBK_TEMPLATES[args.bbk]
        char_url = None
        if not args.no_char:
            pose_key = args.pose or default_pose
            if pose_key not in POSTER_POSES:
                pose_key = "default"
            char_url = generate_poster_character(args.char, pose_key, script_dir)
        html = builder_fn(content, char_url, preset)

        print("  render: Playwright 렌더링 중...")
        out = Path(args.out)
        if out.suffix.lower() != ".png":
            out.mkdir(parents=True, exist_ok=True)
            date_str   = datetime.now().strftime("%Y%m%d")
            title_slug = content.get("title", "poster").replace(" ", "")[:8]
            out = out / f"{args.platform}_{title_slug}_{date_str}.png"
        else:
            out.parent.mkdir(parents=True, exist_ok=True)

        render_html(html, str(out), preset["width"], preset["height"])
        print(f"  saved: {out}")
        _update_session(args.char, script_dir)
        return

    # ── 기존 모드 (--template)
    if not args.template:
        parser.error("--template 또는 --bbk 중 하나를 지정하세요.")

    builder_fn, default_data = TEMPLATES[args.template]
    data = json.loads(Path(args.data).read_text(encoding="utf-8")) if args.data else default_data
    html = builder_fn(data)
    width, height = ASPECT_SIZES[args.aspect]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"포스터 생성 중... ({args.template}, {args.aspect} = {width}×{height})")
    render_html(html, str(out), width, height)
    print(f"done: {out}")


if __name__ == "__main__":
    main()
