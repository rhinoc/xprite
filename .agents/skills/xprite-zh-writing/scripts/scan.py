#!/usr/bin/env python3
"""Soft banned-phrase scanner for Xprite zh-CN drafts.

Usage:
  python3 .agents/skills/xprite-zh-writing/scripts/scan.py path/to/draft.md

Reads patterns from phrases.txt beside this script (one regex per line;
# comments and blank lines ignored). Prints WARN lines with file path,
line number, and the matched text. Does NOT rewrite the file.

Exit code is 0 by default (soft): hits are for the model/author to review
in context — some matches are fine to keep. Pass --strict to exit 1 when
any hit is found (optional local gate; not for default CI).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_LIST = HERE / "phrases.txt"
FENCE_RE = re.compile(r"```[\s\S]*?```")
INLINE_RE = re.compile(r"`[^`\n]+`")


def load_patterns(path: Path) -> list[tuple[str, re.Pattern[str]]]:
    raw = path.read_text(encoding="utf-8")
    out: list[tuple[str, re.Pattern[str]]] = []
    for i, line in enumerate(raw.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        try:
            out.append((s, re.compile(s)))
        except re.error as e:
            print(f"ERROR: bad regex in {path} L{i}: {s!r} ({e})", file=sys.stderr)
            raise SystemExit(2) from e
    return out


def strip_code(text: str) -> str:
    text = FENCE_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    text = INLINE_RE.sub("", text)
    return text


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("draft", type=Path)
    ap.add_argument(
        "--list",
        type=Path,
        default=DEFAULT_LIST,
        help=f"pattern list (default: {DEFAULT_LIST.name})",
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="exit 1 if any hit (default: always exit 0)",
    )
    args = ap.parse_args()

    if not args.list.is_file():
        print(f"ERROR: pattern list not found: {args.list}", file=sys.stderr)
        return 2

    patterns = load_patterns(args.list)
    text = args.draft.read_text(encoding="utf-8")
    body = strip_code(text)
    lines = body.splitlines()

    hits = 0
    for ln, line in enumerate(lines, 1):
        for src, cre in patterns:
            for m in cre.finditer(line):
                hits += 1
                snippet = line.strip()
                if len(snippet) > 120:
                    snippet = snippet[:117] + "…"
                print(f"WARN: {args.draft}:{ln}: matched {m.group(0)!r}  (pattern: {src})")
                print(f"  {snippet}")

    print()
    print(
        "Note: soft regex scan only. It catches named phrases/patterns "
        "(negative framing, process meta, named fillers). "
        "It cannot judge metaphor quality, 浅有深, or whether a hit is "
        "needed — review each hit in context; keep when necessary."
    )
    print(f"Checking: {args.draft}  (patterns from {args.list.name})")
    if hits:
        print(f"Result: {hits} warning(s); exit 0 unless --strict")
    else:
        print("Result: no matches")

    if args.strict and hits:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
