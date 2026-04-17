#!/usr/bin/env python3
"""
BBK 정보형 포스터 생성기 (HTML + Playwright 렌더링)

Phase 1 원칙 준수:
  - 텍스트는 HTML/CSS로 합성 (Imagen에 한글 넣지 않음)
  - Playwright Chromium 헤드리스로 PNG 스크린샷

사용법:
  python generate_poster.py --template refund --out ./poster.png
  python generate_poster.py --template refund --aspect 9:16 --out ./poster.png
  python generate_poster.py --template custom --data ./content.json --out ./poster.png
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ASPECT_SIZES: dict[str, tuple[int, int]] = {
    '9:16': (1080, 1920),
    '1:1':  (1080, 1080),
    '16:9': (1920, 1080),
    '4:5':  (1080, 1350),
}


# ─── 브랜드 스타일 (공통) ─────────────────────────────────────────────────────

BRAND_CSS = '''
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


# ─── 템플릿: 환불 규정 ─────────────────────────────────────────────────────────

REFUND_DATA: dict = {
    'header': {
        'eyebrow': '예약 전 반드시 확인하세요',
        'title':   '예약금 환불 규정',
        'subtitle': '취소 · 노쇼 · 중도해지 — 상황별 환불 기준',
    },
    'cancel_timeline': [
        {
            'level':  'ok',
            'badge':  '72시간 전',
            'sub':    '시공일 3일 전',
            'result': '예약금 전액 환불',
            'amount': '80,000원 전액',
            'note':   '영업일 기준 3일 이내',
        },
        {
            'level':  'warn',
            'badge':  '48시간 전',
            'sub':    '시공일 2일 전',
            'result': '예약금 50% 환불',
            'amount': '40,000원 환불',
            'note':   '진행 여부 확인 후 처리',
        },
        {
            'level':  'danger',
            'badge':  '36시간 이내',
            'sub':    '당일 ~ 36시간',
            'result': '환불 불가',
            'amount': '0원 환불',
            'note':   '일정 변경 안내 가능',
        },
    ],
    'noshow': {
        'title': '노쇼(No-Show) 발생 시',
        'lines': [
            '예약금 전액 환불 불가 (100% 위약금)',
            '방문 후 연락 두절 / 입장 거부 시 동일 적용',
            '재예약 시 예약금 선납 필수',
        ],
        'emphasis': '노쇼는 다른 고객의 기회를 빼앗는 행동입니다',
    },
    'subscription': [
        {
            'level': 'ok',
            'label': '정상 해지 (사전 통보)',
            'items': [
                '해지 신청: 다음 시공일 72시간 전',
                '남은 기간 일할 계산 환불',
                '예: 월 99,000원 → 남은 회차 비례 환불',
            ],
        },
        {
            'level': 'danger',
            'label': '즉시 해지 (72시간 이내)',
            'items': [
                '당월 서비스 비용 전액 청구',
                '이미 제공된 서비스 환불 불가',
                '위약금 없음 (단, 잔여 서비스 소멸)',
            ],
        },
    ],
    'process': [
        '해지/취소 접수 → 카카오톡 또는 전화 문의',
        '환불 금액 확인 → 영업일 기준 1~2일 이내 안내',
        '환불 완료 → 영업일 기준 3~5일 이내 입금',
    ],
    'contact': {
        'phone1':  '010-5434-4877',
        'phone2':  '031-759-4877',
        'kakao':   'BBK 범빌드코리아',
        'hours':   '09:00 ~ 19:00',
    },
    'footer': {
        'logo':    'BUMBUILDKOREA',
        'tagline': '국가 인증 위생관리업 등록 업체',
        'note':    '본 규정은 서비스 약관에 준하며 사전 고지 없이 변경될 수 있습니다',
    },
}


def _level_color(level: str) -> str:
    return {'ok': 'var(--ok)', 'warn': 'var(--warn)', 'danger': 'var(--danger)'}.get(level, 'var(--brand-blue)')


def _level_icon(level: str) -> str:
    return {'ok': '✓', 'warn': '!', 'danger': '✕'}.get(level, '•')


def build_refund_html(data: dict) -> str:
    h = data['header']

    timeline_cards = ''
    for item in data['cancel_timeline']:
        color = _level_color(item['level'])
        icon  = _level_icon(item['level'])
        timeline_cards += f'''
        <div class="tl-card" style="--lvl: {color}">
          <div class="tl-badge"><span class="tl-icon">{icon}</span>{item['badge']}</div>
          <div class="tl-sub">{item['sub']}</div>
          <div class="tl-result">{item['result']}</div>
          <div class="tl-amount">{item['amount']}</div>
          <div class="tl-note">{item['note']}</div>
        </div>
        '''

    noshow_lines = ''.join(f'<li>{line}</li>' for line in data['noshow']['lines'])

    sub_cards = ''
    for card in data['subscription']:
        color = _level_color(card['level'])
        items = ''.join(f'<li>{item}</li>' for item in card['items'])
        sub_cards += f'''
        <div class="sub-card" style="--lvl: {color}">
          <div class="sub-label">{card['label']}</div>
          <ul>{items}</ul>
        </div>
        '''

    process_steps = ''
    for idx, step in enumerate(data['process'], start=1):
        process_steps += f'''
        <div class="proc-step">
          <div class="proc-num">{idx}</div>
          <div class="proc-text">{step}</div>
        </div>
        '''

    c = data['contact']
    f_ = data['footer']

    return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
{BRAND_CSS}

body {{ padding: 64px 56px; }}

.header {{
  background: linear-gradient(135deg, var(--brand-navy), var(--brand-blue));
  color: white;
  padding: 48px 40px;
  border-radius: 24px;
  text-align: center;
  margin-bottom: 40px;
}}
.header .eyebrow {{
  display: inline-block;
  background: rgba(255,255,255,0.18);
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 20px;
}}
.header h1 {{ font-size: 76px; font-weight: 900; margin-bottom: 12px; letter-spacing: -0.02em; }}
.header .subtitle {{ font-size: 26px; opacity: 0.92; font-weight: 500; }}

.section {{ margin-bottom: 44px; }}
.section-title {{
  font-size: 32px; font-weight: 800;
  margin-bottom: 24px;
  display: flex; align-items: center; gap: 12px;
}}
.section-title::before {{
  content: ''; width: 6px; height: 32px;
  background: var(--brand-blue); border-radius: 3px;
}}

.timeline {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }}
.tl-card {{
  border: 3px solid var(--lvl);
  border-radius: 20px;
  padding: 28px 22px;
  background: white;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
}}
.tl-badge {{
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--lvl); color: white;
  padding: 8px 18px; border-radius: 999px;
  font-size: 22px; font-weight: 800; margin-bottom: 14px;
}}
.tl-icon {{
  width: 28px; height: 28px; border-radius: 50%;
  background: white; color: var(--lvl);
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 18px;
}}
.tl-sub {{ color: #666; font-size: 18px; margin-bottom: 14px; }}
.tl-result {{ font-size: 26px; font-weight: 800; color: var(--lvl); margin-bottom: 6px; }}
.tl-amount {{ font-size: 22px; font-weight: 700; margin-bottom: 10px; }}
.tl-note {{ font-size: 16px; color: #888; }}

.noshow {{
  background: #FEF2F2;
  border-left: 8px solid var(--danger);
  padding: 28px 32px; border-radius: 16px;
}}
.noshow-title {{ font-size: 28px; font-weight: 800; margin-bottom: 14px; color: var(--danger); }}
.noshow ul {{ list-style: none; margin-bottom: 16px; }}
.noshow li {{
  font-size: 20px; padding-left: 24px; margin-bottom: 8px; position: relative;
}}
.noshow li::before {{
  content: '•'; color: var(--danger); position: absolute; left: 0; font-weight: 900;
}}
.noshow-emph {{
  font-weight: 700; color: var(--danger);
  padding-top: 14px; border-top: 2px dashed #FCA5A5; font-size: 20px;
}}

.subscription {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.sub-card {{
  border: 3px solid var(--lvl); border-radius: 20px; padding: 28px 24px;
  background: white;
}}
.sub-label {{
  color: var(--lvl); font-size: 24px; font-weight: 800;
  padding-bottom: 12px; border-bottom: 2px solid var(--lvl);
  margin-bottom: 16px;
}}
.sub-card ul {{ list-style: none; }}
.sub-card li {{
  font-size: 19px; padding-left: 22px; margin-bottom: 10px; position: relative;
}}
.sub-card li::before {{
  content: '–'; color: var(--lvl); position: absolute; left: 0; font-weight: 800;
}}

.process {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }}
.proc-step {{
  background: var(--brand-gray);
  border-radius: 16px; padding: 24px 20px; text-align: center;
}}
.proc-num {{
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--brand-blue); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 900; margin: 0 auto 12px;
}}
.proc-text {{ font-size: 18px; font-weight: 600; line-height: 1.4; }}

.contact {{
  background: var(--brand-navy); color: white;
  padding: 32px 36px; border-radius: 20px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}}
.contact-item {{ display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 600; }}
.contact-key {{ opacity: 0.7; font-size: 18px; font-weight: 500; }}

.footer {{
  margin-top: 36px; padding-top: 24px; border-top: 2px solid #E5E7EB;
  display: flex; justify-content: space-between; align-items: center;
}}
.footer-logo {{ font-size: 32px; font-weight: 900; color: var(--brand-blue); letter-spacing: 0.02em; }}
.footer-tagline {{ font-size: 16px; color: #666; }}
.footer-note {{ font-size: 14px; color: #999; text-align: right; max-width: 340px; }}
</style>
</head>
<body>

<div class="header">
  <div class="eyebrow">{h['eyebrow']}</div>
  <h1>{h['title']}</h1>
  <div class="subtitle">{h['subtitle']}</div>
</div>

<div class="section">
  <div class="section-title">예약 취소 환불 규정</div>
  <div class="timeline">{timeline_cards}</div>
</div>

<div class="section">
  <div class="section-title">{data['noshow']['title']}</div>
  <div class="noshow">
    <ul>{noshow_lines}</ul>
    <div class="noshow-emph">"{data['noshow']['emphasis']}"</div>
  </div>
</div>

<div class="section">
  <div class="section-title">구독 서비스 중도해지</div>
  <div class="subscription">{sub_cards}</div>
</div>

<div class="section">
  <div class="section-title">환불 처리 방법</div>
  <div class="process">{process_steps}</div>
</div>

<div class="contact">
  <div class="contact-item"><span class="contact-key">대표번호</span>{c['phone1']}</div>
  <div class="contact-item"><span class="contact-key">지점번호</span>{c['phone2']}</div>
  <div class="contact-item"><span class="contact-key">카카오톡</span>{c['kakao']}</div>
  <div class="contact-item"><span class="contact-key">운영시간</span>{c['hours']}</div>
</div>

<div class="footer">
  <div>
    <div class="footer-logo">{f_['logo']}</div>
    <div class="footer-tagline">{f_['tagline']}</div>
  </div>
  <div class="footer-note">{f_['note']}</div>
</div>

</body>
</html>'''


TEMPLATES = {
    'refund': (build_refund_html, REFUND_DATA),
}


def render_html(html: str, out_path: str, width: int, height: int) -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=2)
        page.set_content(html, wait_until='networkidle')
        page.screenshot(path=out_path, full_page=False)
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description='BBK 정보형 포스터 생성기')
    parser.add_argument('--template', required=True, choices=list(TEMPLATES.keys()), help='템플릿 이름')
    parser.add_argument('--data',     default='',   help='커스텀 JSON 데이터 파일 경로 (선택)')
    parser.add_argument('--aspect',   default='9:16', choices=list(ASPECT_SIZES.keys()))
    parser.add_argument('--out',      required=True, help='출력 PNG 경로')
    args = parser.parse_args()

    builder, default_data = TEMPLATES[args.template]

    if args.data:
        data_path = Path(args.data)
        if not data_path.exists():
            raise SystemExit(f'데이터 파일 없음: {data_path}')
        data = json.loads(data_path.read_text(encoding='utf-8'))
    else:
        data = default_data

    html = builder(data)
    width, height = ASPECT_SIZES[args.aspect]

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f'포스터 생성 중... ({args.template}, {args.aspect} = {width}x{height})')
    render_html(html, str(out_path), width, height)
    print(f'done: {out_path}')


if __name__ == '__main__':
    main()
