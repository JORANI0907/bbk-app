#!/usr/bin/env python3
"""
BBK 포스터 Gemini 프롬프트 생성기

콘텐츠 JSON → Gemini에 직접 붙여넣을 수 있는 프롬프트 .txt 파일 출력.
사용자가 Gemini에서 수동으로 캐릭터 이미지와 함께 붙여넣어 제작.

사용법:
  python generate_poster_prompt.py \
    --content content_민원사전고지.json \
    --template detail \
    --platform insta \
    --char 라니 \
    --out ./outputs/posters/

템플릿 종류:
  checklist  체크리스트형 (준수사항, 지침 등)
  detail     상황+조치 2단 카드형 (민원 안내, 대응 절차 등)
  steps      단계형 (작업 순서, 프로세스 등)
  info       정보 카드형 (서비스 안내, 가격 등)
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

# ─── 공통 브랜드 설정 ─────────────────────────────────────────────────────────
BRAND_BLOCK = """[공통 브랜드 설정 — 모든 포스터 공통 적용]

브랜드명: 범빌드코리아 (BUMBUILDKOREA / BBK)
브랜드 컬러:
  - 메인: #2BA6F2 (연파란색 / 청결 이미지)
  - 다크네이비: #0D2B5E, #1B3A6B
  - 강조: #FFD600 (노란색 포인트)
  - 보조: 흰색, 연회색 (#F5F7FA)
폰트 스타일:
  - 헤드라인: 굵고 임팩트 있는 고딕체 (Black Han Sans 스타일)
  - 본문: 가독성 높은 산세리프 (Noto Sans KR 스타일)
디자인 스타일: 깔끔하고 전문적인 B2B 인포그래픽. 과하지 않은 플랫/세미-3D 디자인
언어: 한국어 (필요 시 영문 병기)
캐릭터: [사용자가 첨부한 BBK 캐릭터 이미지 그대로 사용] — 아래 배치 지시에 따라 합성
로고: [사용자가 첨부한 BBK 로고 이미지 그대로 사용] — 하단 푸터 또는 상단 좌측에 삽입"""

# ─── 플랫폼 비율 ─────────────────────────────────────────────────────────────
PLATFORM_INFO: dict[str, dict] = {
    "insta":         {"ratio": "4:5",  "desc": "세로형 4:5 (인스타그램 피드 최적화)"},
    "insta_story":   {"ratio": "9:16", "desc": "세로형 9:16 (인스타그램 스토리 / 모바일 웹)"},
    "danggeun":      {"ratio": "1:1",  "desc": "정방형 1:1 (당근마켓 / 스마트플레이스)"},
    "smartplace":    {"ratio": "1:1",  "desc": "정방형 1:1 (네이버 스마트플레이스)"},
    "homepage":      {"ratio": "세로 카드", "desc": "세로 카드형 (홈페이지 서비스 안내)"},
    "homepage_wide": {"ratio": "16:9", "desc": "가로형 16:9 (홈페이지 배너 / PC 공유용)"},
    "kakao":         {"ratio": "1:1",  "desc": "정방형 1:1 (카카오비즈 / 카카오채널)"},
    "blog":          {"ratio": "4:5",  "desc": "세로형 4:5 (네이버 블로그 대표 이미지)"},
}

# ─── 캐릭터 정보 ──────────────────────────────────────────────────────────────
CHAR_INFO: dict[str, dict] = {
    "라니": {
        "desc": "BBK 라니 캐릭터 (갈색 토끼 마스코트, 3D 카툰 스타일)",
    },
    "둥이": {
        "desc": "BBK 둥이 캐릭터 (치비 스타일 마스코트, 3D 카툰)",
    },
    "조라니": {
        "desc": "BBK 조라니 캐릭터 (한국 남성 모델, 실사 스타일)",
    },
}

# ─── 상황별 의상 (템플릿 유형 → 캐릭터별 의상) ────────────────────────────────
OUTFIT_BY_TEMPLATE: dict[str, dict[str, str]] = {
    # 체크리스트/지침 — 사무적이고 신뢰감 있는 정장 스타일
    "checklist": {
        "라니": "다크네이비 슬랙스, 흰 드레스 셔츠, BBK 로고 넥타이 — 단정하고 신뢰감 있는 사무 스타일. 한 손엔 클립보드",
        "둥이": "다크네이비 슬랙스, 흰 드레스 셔츠, BBK 로고 넥타이. 한 손엔 클립보드",
        "조라니": "다크네이비 슬랙스, 흰 셔츠, BBK 로고 조끼 — 깔끔한 사무 스타일. 한 손엔 클립보드",
    },
    # 공지/민원 안내 — 현장 작업복 + 메가폰
    "announcement": {
        "라니": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복(연파란 스트라이프, BBK 로고 패치). 한 손엔 메가폰",
        "둥이": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복(연파란 스트라이프, BBK 로고 패치). 한 손엔 메가폰",
        "조라니": "진회색 청바지 작업복, BBK 로고 티셔츠, 작업 장갑. 한 손엔 메가폰",
    },
    # 단계 안내 — 현장 작업복 + 포인터
    "steps": {
        "라니": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복. 한 손엔 포인터 막대 또는 클립보드",
        "둥이": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복. 한 손엔 포인터 막대",
        "조라니": "진회색 청바지 작업복, BBK 로고 티셔츠. 한 손엔 포인터 막대",
    },
    # 서비스 안내 — 깔끔한 폴로 셔츠 + 청소 소품
    "service": {
        "라니": "다크네이비 반팔 폴로 셔츠(BBK 로고 패치), 흰 장갑. 청소 도구 소품 소지",
        "둥이": "다크네이비 반팔 폴로 셔츠(BBK 로고 패치), 흰 장갑",
        "조라니": "BBK 로고 폴로 셔츠, 깔끔한 슬랙스, 전문적 분위기",
    },
    # 정보 카드 — 폴로 셔츠 + 포인터
    "info": {
        "라니": "다크네이비 반팔 폴로 셔츠(BBK 로고 패치), 흰 장갑. 한 손엔 포인터",
        "둥이": "다크네이비 반팔 폴로 셔츠(BBK 로고 패치), 흰 장갑",
        "조라니": "BBK 로고 폴로 셔츠, 깔끔한 슬랙스",
    },
    # 이벤트 — 밝고 활기찬 캐주얼
    "event": {
        "라니": "밝은 파란색 BBK 후드 집업, 흰 장갑 — 축제·이벤트 분위기의 활기찬 스타일",
        "둥이": "밝은 파란색 BBK 후드 집업, 흰 장갑 — 활기차고 밝은 스타일",
        "조라니": "밝은 파란색 BBK 집업, 캐주얼하고 활기찬 스타일",
    },
    # 기본 (fallback) — BBK 작업복
    "default": {
        "라니": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복(연파란 스트라이프, BBK 로고 패치)",
        "둥이": "파란색 작업 캡, 흰 장갑, 다크네이비 작업복(연파란 스트라이프, BBK 로고 패치)",
        "조라니": "진회색 청바지 작업복, BBK 로고 티셔츠, 작업 장갑",
    },
}

# ─── 포즈 설명 ────────────────────────────────────────────────────────────────
POSE_DESC: dict[str, str] = {
    "checklist":    "양쪽 손에 클립보드를 들고 엄지척 자세 — 친근하고 신뢰감 있는 표정",
    "announcement": "한 손에 메가폰을 들고 활기차게 안내하는 포즈 — 밝고 진지한 표정",
    "service":      "청소 도구를 양손으로 들고 환영하는 전문적인 포즈 — 친근하고 프로다운 표정",
    "regulation":   "클립보드를 들고 똑바로 서있는 권위있는 포즈 — 친근하지만 진지한 표정",
    "steps":        "포인터 막대를 들고 설명하는 포즈 — 교육적이고 친근한 표정",
    "info":         "포인터로 안내판을 가리키는 포즈 — 정보를 전달하는 친절한 표정",
    "event":        "두 팔을 들어올리며 축하하는 포즈 — 밝고 축제 분위기의 표정",
    "default":      "자연스럽게 서서 손을 흔드는 포즈 — 친근하고 전문적인 표정",
}


# ─── 캐릭터 크기 자동 계산 ────────────────────────────────────────────────────

def _char_size_guide(content: dict, template: str) -> str:
    """콘텐츠 밀도(섹션 수 × 항목 수) 기반으로 캐릭터 크기·배치 지침 반환."""
    if template in ("checklist", "announcement", "detail"):
        sections = content.get("sections", [])
        n_sections = len(sections)
        if template == "detail":
            total_items = sum(
                len(s.get("situations", [])) + len(s.get("actions", []))
                for s in sections
            )
        else:
            total_items = sum(len(s.get("items", [])) for s in sections)
    elif template == "steps":
        steps = content.get("steps", [])
        n_sections = len(steps)
        total_items = n_sections
    elif template == "info":
        cards = content.get("cards", [])
        n_sections = len(cards)
        total_items = n_sections
    else:
        n_sections, total_items = 2, 6

    if n_sections >= 4 or total_items >= 10:
        # 고밀도 — 캐릭터 소형
        size = "소형 (포스터 너비의 18~22%)"
        placement = "우측 하단 모서리, 푸터 바로 위 — 마지막 섹션 카드 아래 여백에만 배치"
        rule = "텍스트 영역·체크리스트 항목과 절대 겹치지 않음"
    elif n_sections >= 3 or total_items >= 6:
        # 중밀도 — 캐릭터 중형
        size = "중형 (포스터 너비의 23~27%)"
        placement = "우측 하단 — 마지막 섹션 카드의 우측 하단 모서리와만 겹쳐도 됨"
        rule = "카드 테두리(border)와만 겹치고, 카드 안 텍스트 내용은 가리지 않음"
    else:
        # 저밀도 — 캐릭터 대형
        size = "대형 (포스터 너비의 28~33%)"
        placement = "우측 중앙~하단 — 박스 테두리와 자연스럽게 겹쳐도 됨"
        rule = "텍스트 본문만 가리지 않으면 배치 자유"

    return (
        f"- 크기: {size}\n"
        f"- 배치: {placement}\n"
        f"- 텍스트 보호 규칙: {rule}\n"
        f"- ⚠️ 크기 우선순위: 텍스트 가독성 > 캐릭터 크기 — 텍스트가 가려지면 캐릭터를 줄이거나 위치를 조정할 것"
    )


# ─── 템플릿별 프롬프트 빌더 ───────────────────────────────────────────────────

def _header(content: dict, template: str, char: str, platform: str) -> str:
    plat     = PLATFORM_INFO.get(platform, PLATFORM_INFO["insta"])
    cinfo    = CHAR_INFO.get(char, CHAR_INFO["라니"])
    pose     = POSE_DESC.get(template, POSE_DESC["default"])
    title    = content.get("title", "")
    subtitle = content.get("subtitle", "")
    badge    = content.get("badge", "")
    char_msg = content.get("char_msg", "")

    # 상황별 의상 선택
    outfit_map = OUTFIT_BY_TEMPLATE.get(template, OUTFIT_BY_TEMPLATE["default"])
    outfit = outfit_map.get(char, outfit_map["라니"])

    # 콘텐츠 밀도 기반 크기·배치 자동 계산
    size_guide = _char_size_guide(content, template)

    char_extra = f'\n- 말풍선: "{char_msg}"' if char_msg else ""

    return f"""{BRAND_BLOCK}

---

포스터 제목: 「{title}」
부제: {subtitle}
포스터 비율: {plat['desc']}
{f'뱃지/태그: [{badge}]' if badge else ''}

캐릭터 배치 지시 (첨부된 이미지 기준):
- 의상: {outfit}
- 포즈: {pose}
{size_guide}{char_extra}

---

레이아웃 구성:
"""


def build_checklist_prompt(content: dict, char: str, platform: str) -> str:
    sections = content.get("sections", [])
    hero_msg = content.get("hero_msg", "")
    warning  = content.get("warning", "")
    cta      = content.get("cta", {})

    hero_block = ""
    if hero_msg:
        hero_block = f"""
■ 상단 히어로 영역
- 배경: 다크네이비 그라디언트 (#0D2B5E → #1B3A6B)
- 강조 문구 (노란 좌측 라인): "{hero_msg}"
- 하단에 제목이 이어지는 구조
"""

    sections_block = ""
    for sec in sections:
        label = sec.get("label", "")
        icon  = sec.get("icon", "📌")
        items = sec.get("items", [])
        color = sec.get("color", "#1B3A6B")
        items_str = "\n  ".join(f"✅ {it}" for it in items)
        sections_block += f"""
■ 섹션: {icon} {label}
  섹션 헤더: 컬러 배경 카드 (색상 {color}), 아이콘 + 제목 흰글씨
  체크리스트 항목 (흰색 카드, 좌측 컬러 라인):
  {items_str}
"""

    warning_block = f"""
■ 경고 박스
  배경: 연한 노란색 (#FFF8E1), 테두리 노란색, ⚠️ 아이콘
  내용: "{warning}"
""" if warning else ""

    contact_block = f"""
■ 하단 연락처 / 푸터
  배경: 다크네이비 그라디언트
  전화: 📞 {cta.get('text', '031-759-4877')}
  웹사이트: {cta.get('website', 'bbkorea.co.kr')}
  우측: BUMBUILDKOREA 로고 (흰색)
"""

    return (
        _header(content, "checklist", char, platform)
        + hero_block
        + sections_block
        + warning_block
        + contact_block
    )


def build_detail_prompt(content: dict, char: str, platform: str) -> str:
    hero_msg = content.get("hero_msg", "")
    sections = content.get("sections", [])
    warning  = content.get("warning", "")
    cta      = content.get("cta", {})
    title    = content.get("title", "")
    subtitle = content.get("subtitle", "")

    hero_block = f"""
■ 상단 히어로 영역 (전체 너비, 다크 배경)
- 배경: 다크네이비 그라디언트 (#0D2B5E → #1B3A6B → #2A5298)
- 상단: ⚠️ 아이콘 + 제목 「{title}」 (굵고 큰 흰색 고딕체)
- 부제: "{subtitle}" (흰색, 약간 투명)
- 강조 문구 박스 (좌측 노란 4px 라인, 반투명 흰 배경):
  "{hero_msg}"

"""

    sections_block = ""
    for i, sec in enumerate(sections):
        label = sec.get("label", "")
        icon  = sec.get("icon", "📌")
        color = sec.get("color", "#1B3A6B")
        sits  = sec.get("situations", [])
        acts  = sec.get("actions", [])

        sits_str = "\n  ".join(f"· {s}" for s in sits)
        acts_str = "\n  ".join(f"✅ {a}" for a in acts)

        sections_block += f"""
■ 섹션 {i+1}. {icon} {label}

  섹션 헤더 카드:
  - 배경: {color}, 원형 아이콘 배지 + 섹션명 (굵은 흰색 고딕)

  발생 상황 (연회색 배경 #F0F4FA):
  {sits_str}

  조치 사항 (연초록 배경 #E6F4EA):
  {acts_str}

"""

    warning_block = f"""
■ 경고 / 안내 박스
  배경: 연한 주황색 (#FFF3E0), 테두리 주황색, ⚠️ 아이콘
  내용: "{warning}"
""" if warning else ""

    contact_block = f"""
■ 하단 푸터
  배경: 다크네이비 그라디언트
  좌측: 📞 {cta.get('text', '031-759-4877')} / {cta.get('website', 'bbkorea.co.kr')}
  우측: BBK 로고 (흰색 굵은 고딕)
"""

    return (
        _header(content, "announcement", char, platform)
        + hero_block
        + sections_block
        + warning_block
        + contact_block
    )


def build_steps_prompt(content: dict, char: str, platform: str) -> str:
    hero_msg = content.get("hero_msg", "")
    steps    = content.get("steps", [])
    note     = content.get("note", "")
    cta      = content.get("cta", {})

    hero_block = f"""
■ 상단 히어로 영역
  배경: 다크네이비 그라디언트
  강조 문구: "{hero_msg}"

""" if hero_msg else ""

    steps_block = ""
    for i, step in enumerate(steps):
        color = step.get("color", "#1B3A6B")
        steps_block += f"""
■ STEP {i+1}. {step.get('label', f'단계 {i+1}')}
  번호 원형 배지: 색상 {color}, 흰색 번호
  내용: {step.get('text', '')}
  {f'보조 설명: {step["sub"]}' if step.get("sub") else ""}
  {'↓ 화살표 연결선 (다음 단계로)' if i < len(steps)-1 else ''}

"""

    note_block = f"""
■ 핵심 안내 박스
  배경: 다크네이비, 💡 아이콘
  내용: "{note}"
""" if note else ""

    contact_block = f"""
■ 하단 푸터
  배경: 다크네이비 그라디언트
  📞 {cta.get('text', '031-759-4877')} / {cta.get('website', 'bbkorea.co.kr')}
  BBK 로고
"""

    return (
        _header(content, "steps", char, platform)
        + hero_block
        + steps_block
        + note_block
        + contact_block
    )


def build_info_prompt(content: dict, char: str, platform: str) -> str:
    highlight     = content.get("highlight", "")
    highlight_sub = content.get("highlight_sub", "")
    cards         = content.get("cards", [])
    note          = content.get("note", "")
    cta           = content.get("cta", {})

    highlight_block = f"""
■ 핵심 수치 강조 영역
  배경: 다크네이비 그라디언트
  메인 숫자/텍스트: "{highlight}" (초대형 노란색 #FFD600)
  보조 설명: "{highlight_sub}"

""" if highlight else ""

    cards_block = ""
    for card in cards:
        color = card.get("color", "#1B3A6B")
        cards_block += f"""
■ 정보 카드: {card.get('icon','📌')} {card.get('title','')}
  상단 컬러 라인: {color}
  내용: {card.get('text','')}

"""

    note_block = f"""
■ 안내 박스
  배경: 다크네이비, 💡 아이콘
  내용: "{note}"
""" if note else ""

    contact_block = f"""
■ 하단 푸터
  📞 {cta.get('text', '031-759-4877')} / {cta.get('website', 'bbkorea.co.kr')}
  BBK 로고
"""

    return (
        _header(content, "info", char, platform)
        + highlight_block
        + cards_block
        + note_block
        + contact_block
    )


BUILDERS = {
    "checklist": build_checklist_prompt,
    "detail":    build_detail_prompt,
    "steps":     build_steps_prompt,
    "info":      build_info_prompt,
}


# ─── 메인 ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="BBK 포스터 Gemini 프롬프트 생성기")
    parser.add_argument("--content",  required=True, help="콘텐츠 JSON 파일 경로")
    parser.add_argument("--template", default="detail",
                        choices=list(BUILDERS.keys()),
                        help="포스터 템플릿 종류")
    parser.add_argument("--platform", default="insta",
                        choices=list(PLATFORM_INFO.keys()),
                        help="플랫폼 프리셋")
    parser.add_argument("--char",     default="라니",
                        choices=["라니", "둥이", "조라니"],
                        help="캐릭터 선택")
    parser.add_argument("--out", default="",
                        help="저장 폴더 경로 (기본: --content 파일과 같은 폴더)")
    # 콘텐츠 파일명과 통일을 위해 stem을 외부에서 지정 가능
    parser.add_argument("--stem", default="",
                        help="파일명 앞부분 (예: 2026-05-06_규정_비품관리). 기본: 날짜+제목 자동생성")
    args = parser.parse_args()

    content_path = Path(args.content)
    content = json.loads(content_path.read_text(encoding="utf-8"))

    builder = BUILDERS[args.template]
    prompt_text = builder(content, args.char, args.platform)

    # 출력 폴더: --out이 있으면 그 폴더, 없으면 content 파일과 같은 폴더
    if args.out:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
    else:
        out_dir = content_path.parent

    # 파일명: --stem이 있으면 "{stem}_이미지프롬프트.txt", 없으면 날짜+제목 자동
    if args.stem:
        filename = f"{args.stem}_이미지프롬프트.txt"
    else:
        date_str   = datetime.now().strftime("%Y-%m-%d")
        title_slug = content.get("title", "poster").replace(" ", "")[:8]
        filename   = f"{date_str}_이미지프롬프트_{title_slug}.txt"

    out = out_dir / filename
    out.write_text(prompt_text, encoding="utf-8")
    print(f"저장: {out}")
    print("→ Gemini에 BBK 캐릭터 이미지 첨부 후 위 파일 내용 붙여넣기")


if __name__ == "__main__":
    main()
