#!/usr/bin/env python3
"""Format Xprite zh-CN drafts for mechanical rules.

Usage:
  python3 .agents/skills/xprite-zh-writing/scripts/format.py DRAFT.md
  python3 .agents/skills/xprite-zh-writing/scripts/format.py DRAFT.md --fix-in-place

Fixes (with --fix-in-place): CJK↔Latin/digit half-width spaces; half-width
punct near Chinese → full-width; spaces around full-width punct; ASCII quotes
near Chinese; ' - ' → ——; 您 → 你.

Content / AI-flavor phrases: use scripts/scan.py (soft WARN list in phrases.txt).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

CJK = r"\u4e00-\u9fff"

# Protect code while formatting
FENCE_RE = re.compile(r"```[\s\S]*?```")
INLINE_RE = re.compile(r"`[^`\n]+`")


def protect(text: str) -> tuple[str, list[str]]:
    slots: list[str] = []

    def save(m: re.Match[str]) -> str:
        slots.append(m.group(0))
        return f"\0{len(slots) - 1}\0"

    text = FENCE_RE.sub(save, text)
    text = INLINE_RE.sub(save, text)
    return text, slots


def restore(text: str, slots: list[str]) -> str:
    def load(m: re.Match[str]) -> str:
        return slots[int(m.group(1))]

    return re.sub(r"\0(\d+)\0", load, text)


def format_body(body: str) -> str:
    # 您 → 你
    body = body.replace("您", "你")
    # ' - ' → ——
    body = body.replace(" - ", "——")
    # spaces around full-width punct
    body = re.sub(r" +([，。？！：；、」』）】])", r"\1", body)
    body = re.sub(r"([，。？！：；、「『（【]) +", r"\1", body)
    # half-width punct between/near CJK → full-width
    hw = {",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；", "(": "（", ")": "）"}
    for a, b in hw.items():
        body = re.sub(rf"([{CJK}])\s*{re.escape(a)}\s*", rf"\1{b}", body)
        body = re.sub(rf"\s*{re.escape(a)}\s*([{CJK}])", rf"{b}\1", body)
    # ASCII "… " around or next to CJK → 「…」
    def repl_quotes(s: str) -> str:
        out = []
        i = 0
        while i < len(s):
            if s[i] == '"':
                j = s.find('"', i + 1)
                if j != -1 and re.search(rf"[{CJK}]", s[i : j + 1]):
                    out.append("「" + s[i + 1 : j] + "」")
                    i = j + 1
                    continue
            out.append(s[i])
            i += 1
        return "".join(out)

    body = repl_quotes(body)
    # CJK + Latin/digit → insert space
    body = re.sub(rf"([{CJK}])([A-Za-z0-9])", r"\1 \2", body)
    body = re.sub(rf"([A-Za-z0-9])([{CJK}])", r"\1 \2", body)
    return body


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("draft", type=Path)
    ap.add_argument("--fix-in-place", action="store_true", help="write formatted text back to draft")
    args = ap.parse_args()
    raw = args.draft.read_text(encoding="utf-8")
    protected, slots = protect(raw)
    formatted = restore(format_body(protected), slots)

    changed = formatted != raw
    if args.fix_in_place and changed:
        args.draft.write_text(formatted, encoding="utf-8")
        print(f"Formatted in place: {args.draft}")
    elif changed:
        print(f"Format differs from file (pass --fix-in-place to write): {args.draft}")
    else:
        print(f"Format OK: {args.draft}")

    print("Result: OK (phrase scan: scripts/scan.py)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
