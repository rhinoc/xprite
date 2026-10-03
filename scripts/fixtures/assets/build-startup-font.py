#!/usr/bin/env python3
"""Subset the existing pixel font for startup copy. Requires fonttools and brotli."""

from html.parser import HTMLParser
from pathlib import Path
import hashlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont


class StartupCopy(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.text = []

    def handle_starttag(self, tag, attributes):
        if self.depth:
            self.depth += 1
        elif "xse-startup-copy" in dict(attributes).get("class", "").split():
            self.depth = 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1

    def handle_data(self, text):
        if self.depth:
            self.text.append(text)


root = Path(__file__).resolve().parents[3]
copy = StartupCopy()
html_path = root / "apps/editor/index.html"
html = html_path.read_text()
copy.feed(html)
text = " ".join(" ".join(copy.text).split())
if not text:
    raise ValueError("No startup copy found in the editor HTML")
# CSS ch sizing needs the zero glyph even when no numeral is displayed.
text += "0"
font = TTFont(root / "packages/ui/assets/fonts/aseprite/aseprite.woff2")
font.recalcTimestamp = False
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
font.flavor = "woff2"
output = root / "apps/editor/assets/public/startup-pixel.woff2"
font.save(output)
version = hashlib.sha256(output.read_bytes()).hexdigest()[:12]
html = re.sub(
    r"startup-pixel\.woff2(?:\?v=[a-zA-Z0-9-]+)?",
    f"startup-pixel.woff2?v={version}",
    html,
)
html_path.write_text(html)
worker_path = root / "apps/editor/assets/public/sw.js"
worker_path.write_text(
    re.sub(
        r"startup-pixel\.woff2(?:\?v=[a-zA-Z0-9-]+)?",
        f"startup-pixel.woff2?v={version}",
        worker_path.read_text(),
    )
)
print(f"Startup pixel font: {len(set(text))} characters, {output.stat().st_size} bytes")
