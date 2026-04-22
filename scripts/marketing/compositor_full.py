"""
BBK Thumbnail Compositor - Server Version
POST /composite  ->  { background_base64, main_text, sub_text, font_category, style, tags? }
                 <-  { result_base64, filename, saved_to }
POST /generate   ->  { title, sub?, region?, item?, bg_url?, color?, type?, trigger_type? }
                 <-  { ok, result_base64, filename, saved_to }
GET  /health     <-  { status: "ok" }
"""

from flask import Flask, request, jsonify
from PIL import Image, ImageDraw, ImageFont
import base64, io, os, json, urllib.request
from datetime import datetime

app = Flask(__name__)

BASE_DIR   = "/home/ubuntu/bbk/compositor"
FONTS_DIR  = os.path.join(BASE_DIR, "fonts")
OUTPUT_DIR = os.path.join(BASE_DIR, "output", "thumbnails")
LOGO_PATH  = os.path.join(BASE_DIR, "logo.png")
SIZE       = (1080, 1080)

FONT_MAP = {
    "ARTISTIC": os.path.join(FONTS_DIR, "artistic", "BlackHanSans-Regular.ttf"),
    "CLEAN":    os.path.join(FONTS_DIR, "clean",    "NanumMyeongjoBold.ttf"),
    "SOFT":     os.path.join(FONTS_DIR, "soft",     "NanumBarunpenB.ttf"),
}
FONT_SUB = os.path.join(FONTS_DIR, "soft", "NanumSquareRoundR.ttf")

TEXT_ZONES = {
    "STYLE_01": {"y_start": 0.03, "y_end": 0.33, "align": "center"},
    "STYLE_02": {"y_start": 0.03, "y_end": 0.30, "align": "left"},
    "STYLE_03": {"y_start": 0.05, "y_end": 0.35, "align": "left"},
    "STYLE_04": {"y_start": 0.05, "y_end": 0.50, "align": "left"},
    "STYLE_05": {"y_start": 0.04, "y_end": 0.33, "align": "left"},
    "STYLE_06": {"y_start": 0.03, "y_end": 0.40, "align": "center"},
}

TEXT_COLORS = {
    "STYLE_01": {"main": (55, 15, 75),    "sub": (90, 40, 110),   "shadow": (200, 150, 210)},
    "STYLE_02": {"main": (255, 255, 255), "sub": (220, 245, 255), "shadow": (0, 60, 130)},
    "STYLE_03": {"main": (35, 18, 8),     "sub": (85, 55, 28),    "shadow": (200, 155, 90)},
    "STYLE_04": {"main": (18, 18, 28),    "sub": (75, 78, 100),   "shadow": (175, 178, 200)},
    "STYLE_05": {"main": (255, 255, 255), "sub": (145, 198, 255), "shadow": (0, 45, 115)},
    "STYLE_06": {"main": (255, 240, 75),  "sub": (255, 255, 255), "shadow": (0, 75, 175)},
}

os.makedirs(OUTPUT_DIR, exist_ok=True)


def load_font(font_category, size):
    path = FONT_MAP.get(font_category.upper(), FONT_MAP["SOFT"])
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def load_sub_font(size):
    try:
        return ImageFont.truetype(FONT_SUB, size)
    except Exception:
        return ImageFont.load_default()


def draw_shadow(draw, pos, text, font, color, shadow_color, strength=3):
    x, y = pos
    for dx in range(-strength, strength + 1):
        for dy in range(-strength, strength + 1):
            if dx != 0 or dy != 0:
                draw.text((x + dx, y + dy), text, font=font,
                          fill=(*shadow_color[:3], 100))
    draw.text((x, y), text, font=font, fill=color)


def draw_outline(draw, pos, text, font, fill, outline, width=3):
    x, y = pos
    for dx in [-width, 0, width]:
        for dy in [-width, 0, width]:
            if dx != 0 or dy != 0:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def text_width(draw, text, font):
    try:
        return int(draw.textlength(text, font=font))
    except Exception:
        return len(text) * getattr(font, "size", 20)


def add_logo(canvas):
    if not os.path.exists(LOGO_PATH):
        return canvas
    logo = Image.open(LOGO_PATH).convert("RGBA")
    lw = 140
    lh = int(logo.height * lw / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    layer.paste(logo, (22, SIZE[1] - lh - 16), logo)
    return Image.alpha_composite(canvas, layer)


def composite(bg_img, main_text, sub_text, font_category, style_key, tags=None):
    canvas = bg_img.convert("RGBA").resize(SIZE, Image.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    zone = TEXT_ZONES.get(style_key, TEXT_ZONES["STYLE_01"])
    colors = TEXT_COLORS.get(style_key, TEXT_COLORS["STYLE_01"])
    y_top = int(SIZE[1] * zone["y_start"])
    align = zone["align"]
    margin = 55

    f_main = load_font(font_category, 78)
    tw_main = text_width(draw, main_text, f_main)
    x_main = (SIZE[0] - tw_main) // 2 if align == "center" else margin

    if style_key in ("STYLE_02", "STYLE_06"):
        draw_outline(draw, (x_main, y_top), main_text, f_main,
                     fill=colors["main"], outline=colors["shadow"], width=3)
    else:
        draw_shadow(draw, (x_main, y_top), main_text, f_main,
                    colors["main"], colors["shadow"], strength=3)

    f_sub = load_sub_font(30)
    sub_y = y_top + 100
    tw_sub = text_width(draw, sub_text, f_sub)
    x_sub = (SIZE[0] - tw_sub) // 2 if align == "center" else margin + 2
    sub_color = (*colors["sub"][:3], 210)
    draw_shadow(draw, (x_sub, sub_y), sub_text, f_sub,
                sub_color, colors["shadow"], strength=2)

    if style_key == "STYLE_04":
        draw.rectangle([x_sub, sub_y + 38, x_sub + tw_sub, sub_y + 42],
                       fill=(43, 166, 242, 210))

    if tags:
        f_tag = load_sub_font(22)
        tx, ty = margin, SIZE[1] - 58
        for tag in tags:
            draw_shadow(draw, (tx, ty), tag, f_tag,
                        (43, 166, 242), colors["shadow"], strength=2)
            tx += text_width(draw, tag, f_tag) + 16

    return add_logo(canvas)


def _send_slack(filename, title, region, item):
    try:
        slack_url = os.environ.get("SLACK_WEBHOOK_URL", "")
        text = "thumbnail done | title:{} region:{} item:{} file:{}".format(
            title, region or "-", item or "-", filename
        )
        msg = json.dumps({"text": text}).encode()
        req = urllib.request.Request(slack_url, data=msg, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "BBK Compositor"})


@app.route("/composite", methods=["POST"])
def composite_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    for field in ["background_base64", "main_text", "sub_text", "font_category", "style"]:
        if field not in data:
            return jsonify({"error": "Missing field: {}".format(field)}), 400

    try:
        bg_bytes = base64.b64decode(data["background_base64"])
        bg_img = Image.open(io.BytesIO(bg_bytes))
    except Exception as e:
        return jsonify({"error": "Invalid image: {}".format(e)}), 400

    result = composite(
        bg_img,
        data["main_text"],
        data["sub_text"],
        data["font_category"],
        data["style"],
        data.get("tags", []),
    )

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = "thumb_{}.png".format(ts)
    save_path = os.path.join(OUTPUT_DIR, filename)
    result.convert("RGB").save(save_path, "PNG", quality=95)

    buf = io.BytesIO()
    result.convert("RGB").save(buf, format="PNG")
    result_b64 = base64.b64encode(buf.getvalue()).decode()

    return jsonify({"result_base64": result_b64, "filename": filename, "saved_to": save_path})


@app.route("/generate", methods=["POST"])
def generate_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    title = data.get("title", "")
    if not title:
        return jsonify({"error": "title field required"}), 400

    sub = data.get("sub", "")
    region = data.get("region", "")
    item = data.get("item", "")
    bg_url = data.get("bg_url", "")
    color = data.get("color", "yellow")
    style_type = data.get("type", "bold")

    color_style_map = {
        "yellow": "STYLE_06",
        "red":    "STYLE_02",
        "pink":   "STYLE_01",
        "white":  "STYLE_03",
        "cyan":   "STYLE_05",
    }
    font_type_map = {
        "bold":   "ARTISTIC",
        "clean":  "CLEAN",
        "poster": "SOFT",
    }
    style_key = color_style_map.get(color, "STYLE_06")
    font_category = font_type_map.get(style_type, "ARTISTIC")

    if bg_url:
        try:
            with urllib.request.urlopen(bg_url, timeout=15) as resp:
                bg_bytes = resp.read()
            bg_img = Image.open(io.BytesIO(bg_bytes))
        except Exception as e:
            return jsonify({"error": "bg download failed: {}".format(e)}), 400
    else:
        bg_img = Image.new("RGB", SIZE, (0, 48, 135))

    tags = []
    if region:
        tags.append("#{}".format(region))
    if item:
        tags.append("#{}".format(item))

    try:
        result = composite(bg_img, title, sub, font_category, style_key, tags)
    except Exception as e:
        return jsonify({"error": "composite failed: {}".format(e)}), 500

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = "thumb_{}.png".format(ts)
    save_path = os.path.join(OUTPUT_DIR, filename)
    result.convert("RGB").save(save_path, "PNG", quality=95)

    buf = io.BytesIO()
    result.convert("RGB").save(buf, format="PNG")
    result_b64 = base64.b64encode(buf.getvalue()).decode()

    _send_slack(filename, title, region, item)

    return jsonify({"ok": True, "result_base64": result_b64, "filename": filename, "saved_to": save_path})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print("BBK Compositor start: http://0.0.0.0:{}".format(port))
    app.run(host="0.0.0.0", port=port, debug=False)
