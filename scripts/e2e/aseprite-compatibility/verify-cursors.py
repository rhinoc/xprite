"""Check shipped cursor SVGs, runtime hotspots and the accompanying notice."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

root = Path("packages/ui/assets/cursors/aseprite")
manifest = json.loads((root / "manifest.json").read_text())
notice = Path("LICENSES/aseprite-theme.txt").read_text()
assert set(manifest) == {"cursors"}
assert "Copyright (C) 2009-2017 David Capello and Ilija Melentijevic" in notice
assert "Creative Commons Attribution 4.0" in notice
count = 0

for name, entry in manifest["cursors"].items():
    assert set(entry) == {"sizes"}
    for size, record in entry["sizes"].items():
        width = int(size)
        svg = ET.parse(root / record["file"]).getroot()
        assert set(record) == {"file", "hotspotX", "hotspotY"}
        assert int(svg.attrib["width"]) == int(svg.attrib["height"]) == width
        assert svg.attrib["data-cursor"] == name
        assert svg.attrib["data-css-hotspot"] == f"{record['hotspotX']},{record['hotspotY']}"

        metadata = json.loads(svg.findtext("{http://www.w3.org/2000/svg}metadata"))
        assert metadata["cssHotspot"] == {"x": record["hotspotX"], "y": record["hotspotY"]}
        assert metadata["sourcePart"] == f"cursor_{name}"
        viewbox = [int(value) for value in svg.attrib["viewBox"].split()]
        assert width % 16 == 0 and viewbox[2:] == [16, 16]

        occupied = set()
        rects = svg.findall(".//{http://www.w3.org/2000/svg}rect")
        assert rects
        for pixel in rects:
            assert pixel.attrib["width"] == pixel.attrib["height"] == "1"
            x, y = int(pixel.attrib["x"]), int(pixel.attrib["y"])
            assert 0 <= x < 16 and 0 <= y < 16 and (x, y) not in occupied
            occupied.add((x, y))
            assert re.fullmatch(r"#[0-9a-fA-F]{6}", pixel.attrib["fill"])
        count += 1

print(f"{len(manifest['cursors'])} cursor roles / {count} SVG sizes: runtime metadata, SVG geometry, hotspots and CC BY 4.0 notice pass.")
