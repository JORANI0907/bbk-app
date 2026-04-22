import os
import json

def _send_slack(filename, title, region, item):
    try:
        import urllib.request
        slack_url = os.environ.get("SLACK_WEBHOOK_URL", "")
        text = "*thumbnail done* title:{} region:{} item:{} file:{}".format(
            title, region or "-", item or "-", filename
        )
        msg = json.dumps({"text": text}).encode()
        req = urllib.request.Request(slack_url, data=msg, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


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
            import urllib.request as _req
            with _req.urlopen(bg_url, timeout=15) as resp:
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
