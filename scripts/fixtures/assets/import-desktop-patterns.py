"""Import curated native desktop tiles and generate the UI catalog/enum/CSS.

Run with the root assets:desktop-patterns script. Original disks remain in .refs.
Requires machfs and macresources in .tmp/system7-icon-tools (or on PYTHONPATH).
Only PAT# / ppat resources are read; full PICT wallpaper images are excluded.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zlib
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.tmp/system7-icon-tools'))
import machfs
import macresources
from macresources.greggybits import unpack

def png(width, height, pixels):

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 4294967295)
    rows = []
    for y in range(height):
        row = b''.join((struct.pack('>3H', *pixels[y * width + x]) for x in range(width)))
        rows.append(b'\x00' + row)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 16, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')

def resource_data(r):
    return bytes(unpack(r.data)) if r.attribs & 1 else bytes(r.data)

def resources(disk, path):
    v = machfs.Volume()
    v.read((ROOT / disk).read_bytes())
    f = v
    for key in path:
        f = f[key]
    return list(macresources.parse_file(f.rsrc))

def pixel_pattern(r):
    d = resource_data(r)
    typ = struct.unpack_from('>H', d)[0]
    mp, dp = struct.unpack_from('>2I', d, 2)
    if typ != 1:
        raise ValueError(('unsupported pattern type', r.id, typ))
    row = struct.unpack_from('>H', d, mp + 4)[0] & 16383
    top, left, bottom, right = struct.unpack_from('>4h', d, mp + 6)
    width, height = (right - left, bottom - top)
    depth = struct.unpack_from('>H', d, mp + 32)[0]
    pack = struct.unpack_from('>H', d, mp + 14)[0]
    ct = struct.unpack_from('>I', d, mp + 42)[0]
    if depth not in (1, 2, 4, 8) or pack != 0:
        raise ValueError(('unsupported pixels', r.id, depth, pack))
    if ct - dp != row * height:
        raise ValueError(('pixel length mismatch', r.id))
    flags, count = struct.unpack_from('>2H', d, ct + 4)
    palette = {}
    for i in range(count + 1):
        index, red, green, blue = struct.unpack_from('>4H', d, ct + 8 + i * 8)
        palette[i if flags & 32768 else index] = (red, green, blue)
    pixels = []
    for y in range(height):
        for x in range(width):
            bit = x * depth
            value = d[dp + y * row + bit // 8] >> 8 - depth - bit % 8 & (1 << depth) - 1
            pixels.append(palette[value])
    return (width, height, depth, pixels)
records = []
rs = resources('.refs/system7-icons/System70-HD.dsk', ['System Folder', 'System'])
r = next((r for r in rs if r.type == b'PAT#' and r.id == 0))
data = resource_data(r)
for index in range(struct.unpack_from('>H', data)[0]):
    rows = data[2 + index * 8:10 + index * 8]
    pixels = [(0, 0, 0) if rows[y] & 128 >> x else (65535, 65535, 65535) for y in range(8) for x in range(8)]
    records.append(dict(version='7.0', index=index + 1, rid=0, name=f'Classic {index + 1:02}', resourceType='PAT#', sourceFile='System Folder/System', resourceSha256=hashlib.sha256(data).hexdigest(), patternSha256=hashlib.sha256(rows).hexdigest(), w=8, h=8, pixels=pixels))
for version, disk, file in [('7.5', '.refs/system7-icons/System75-HD.dsk', 'Desktop Patterns'), ('8.0', '.refs/macos8-icons/Mac OS 8.0 HD.dsk', 'Desktop Pictures')]:
    for r in resources(disk, ['System Folder', 'Control Panels', file]):
        if r.type == b'ppat':
            w, h, depth, pixels = pixel_pattern(r)
            records.append(dict(version=version, rid=r.id, name=r.name or f'System 7.5 {r.id}', resourceType='ppat', sourceFile='System Folder/Control Panels/'+file, resourceSha256=hashlib.sha256(resource_data(r)).hexdigest(), w=w, h=h, pixels=pixels))

def minimal_period(p, w, h):
    dw = next((d for d in range(1, w + 1) if w % d == 0 and all((p[y * w + x] == p[y * w + x % d] for y in range(h) for x in range(w)))))
    dh = next((d for d in range(1, h + 1) if h % d == 0 and all((p[y * w + x] == p[y % d * w + x] for y in range(h) for x in range(dw)))))
    return (dw, dh, [p[y * w + x] for y in range(dh) for x in range(dw)])

def energy(a, b):
    return sum((abs(a[i] - b[i]) for i in range(3))) / 3 / 65535

def percentile(a, q):
    return sorted(a)[round((len(a) - 1) * q)] if a else 0
accepted = []
excluded = []
mono = {}
color = {}
for r in records:
    w, h, p = minimal_period(r['pixels'], r['w'], r['h'])
    r['period'] = [w, h]
    r['colors'] = len(set(p))
    flags = []
    for axis, n in [('x', w), ('y', h)]:
        if n <= 1:
            continue
        if axis == 'x':
            wrap = sum((energy(p[y * w + w - 1], p[y * w]) for y in range(h))) / h
            internal = [sum((energy(p[y * w + x - 1], p[y * w + x]) for y in range(h))) / h for x in range(1, w)]
        else:
            wrap = sum((energy(p[(h - 1) * w + x], p[x]) for x in range(w))) / w
            internal = [sum((energy(p[(y - 1) * w + x], p[y * w + x]) for x in range(w))) / w for y in range(1, h)]
        mean = sum(internal) / len(internal)
        limit = percentile(internal, 0.95)
        if wrap > limit + 0.04 and wrap > max(0.1, mean * 2.5):
            flags.append(dict(axis=axis, wrap=round(wrap, 4), internal95=round(limit, 4)))
    r['flags'] = flags
    # The raised 8px frame is an intentional tile border; only the reviewed long gradient is excluded.
    if r['version'] == '7.5' and r['rid'] == 7041:
        r['exclusionReason'] = 'Vertical color ramp has a visible reset at the repeated boundary'
        excluded.append(r)
        continue
    if r['colors'] <= 2:
        colors = sorted(set(p), key=lambda c: sum(c))
        bits = [int(c == colors[0]) for c in p]
        if len(colors) == 1:
            bits = [0] * len(p)
        if len(p) <= 256:
            candidates = [bytes((bits[(y + dy) % h * w + (x + dx) % w] ^ invert for y in range(h) for x in range(w))) for dy in range(h) for dx in range(w) for invert in [0, 1]]
            key = (w, h, min(candidates))
        else:
            key = (w, h, bytes(bits))
        bank = mono
    else:
        key = (w, h, hashlib.sha256(b''.join((struct.pack('>3H', *c) for c in p))).hexdigest())
        bank = color
    if key in bank:
        r['duplicateOf'] = bank[key]['name']
        bank[key].setdefault('related', []).append({k: v for k, v in r.items() if k != 'pixels'})
    else:
        bank[key] = r
        accepted.append(r)
print('accepted', len(accepted), 'mono', len(mono), 'color', len(color), 'excluded', len(excluded), 'duplicates', len(records) - len(accepted) - len(excluded))
for r in excluded:
    print('EXCLUDED', r['version'], r['name'], r['period'], r['flags'])
for r in records:
    if 'duplicateOf' in r:
        print('DUPLICATE', r['version'], r['name'], '->', r['duplicateOf'])
summary = lambda r: {k: v for k, v in r.items() if k != 'pixels'}
(ROOT / '.tmp/pattern-import').mkdir(parents=True, exist_ok=True)
(ROOT / '.tmp/pattern-import/audit.json').write_text(json.dumps({'accepted': [summary(r) for r in accepted], 'excluded': [summary(r) for r in excluded], 'all': [summary(r) for r in records]}, indent=2))
OUT = ROOT / 'packages/ui/assets/patterns/macintosh'
SOURCE = ROOT / 'packages/ui/src/components/pattern'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
for old in OUT.glob('*.svg'):
    old.unlink()
for old in OUT.glob('*.png'):
    old.unlink()
classic_labels = {1: ('Solid', '纯色'), 2: ('Sparse light dots', '稀疏亮点'), 3: ('Dotted grid', '点阵网格'), 4: ('Checker gray', '棋盘灰'), 5: ('Fine grid', '细网格'), 6: ('Vertical stripes', '竖条纹'), 7: ('Diagonal stripes', '斜条纹'), 8: ('Wide vertical stripes', '宽竖纹'), 10: ('Scattered dots', '散点'), 11: ('Square grid', '方格'), 12: ('Brickwork', '砖墙'), 13: ('Single dots', '单点'), 14: ('Broken diagonals', '断续斜纹'), 20: ('Solid', '纯色'), 21: ('Offset dots', '交错点'), 25: ('Horizontal stripes', '横条纹'), 27: ('Wide horizontal stripes', '宽横纹'), 28: ('Fine diagonals', '细斜纹'), 30: ('Large grid', '大网格'), 37: ('Basket weave', '篮纹'), 38: ('Dotted diamonds', '点阵菱形')}
system75_labels = {128: ('Blue texture', '蓝色纹理'), 131: ('Stars', '星光'), 133: ('Smiley faces', '笑脸'), 137: ('Geometric confetti', '几何彩块'), 139: ('Cats', '猫'), 147: ('Raised squares', '立体方块'), 1111: ('Circuits', '电路')}
name_zh = {'Copland Blue': 'Copland 蓝', 'Embossed Mac OS Logo': '浮雕 Mac OS 标志', 'Fibers': '纤维', 'Neon Clouds': '霓虹云', 'Blue Cord': '蓝色织纹', 'Granite': '花岗岩', 'Bumpy Blue': '蓝色凹凸纹', 'Raised Lavender': '薰衣草浮雕', 'Blue Ridges': '蓝色山脊', 'Terra Cotta': '陶土', 'The Rocks': '岩石', 'Tulips': '郁金香', 'Sidewalk': '人行道', 'Rubber Bands': '橡皮筋', 'Grass': '草地', 'Bark': '树皮', 'Denim': '牛仔布', 'Bricks': '砖块', 'Notes': '音符', 'Stained Glass Window': '彩色玻璃窗', 'Teddy Bears': '泰迪熊', 'Circuits': '电路', 'PowerBook Traditional': '经典 PowerBook'}
catalog = []
variants = []
provenance = []
for r in accepted:
    w, h, p = minimal_period(r['pixels'], r['w'], r['h'])
    two_color = len(set(p)) <= 2
    if r['version'] == '7.0':
        enum = f"System7Pattern{r['index']:02d}"
        id = f"mono-system7-{r['index']:02d}"
        label, zh = classic_labels.get(r['index'], (f"Pattern {r['index']:02d}", f"图案 {r['index']:02d}"))
        group = 'system7'
    elif r['version'] == '7.5':
        enum = f"System75Pattern{r['rid']}"
        id = f"{('mono-' if two_color else '')}system75-{r['rid']}"
        label, zh = system75_labels.get(r['rid'], (f"Pattern {r['rid']}", f"图案 {r['rid']}"))
        group = 'system75'
    else:
        import re
        words = re.findall('[A-Za-z0-9]+', r['name'])
        enum = 'MacOS8' + ''.join((word[0].upper() + word[1:] for word in words))
        id = 'macos8-' + '-'.join((word.lower() for word in words))
        label = r['name']
        zh = name_zh.get(label, label)
        group = 'macos8'
    item = {'id': id, 'label': label, 'labelZh': zh, 'group': group, 'kind': 'two-color' if two_color else 'color', 'width': w, 'height': h, 'sourceVersion': r['version']}
    if two_color:
        palette = sorted(set(p), key=lambda c: sum(c))
        foreground = palette[0]
        background = palette[-1]
        bits = [int(c == foreground) for c in p] if len(palette) > 1 else [0] * len(p)
        path = ''.join((f'M{x} {y}h1v1H{x}z' for y in range(h) for x in range(w) if bits[y * w + x]))

        def hexcolor(c):
            return '#' + ''.join((f'{round(v / 257):02x}' for v in c))

        def csscolor(c):
            return 'rgb(' + ','.join((f'{v / 65535 * 100:.8f}%' for v in c)) + ')'
        template = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges"><path fill="{{{{background}}}}" d="M0 0h{w}v{h}H0z"/><path fill="{{{{foreground}}}}" d="{path}"/></svg>'
        item.update(svgTemplate=template, defaultForeground=hexcolor(foreground), defaultBackground=hexcolor(background), hasForeground=any(bits), hasBackground=not all(bits))
        filename = id + '.svg'
        (OUT / filename).write_text(template.replace('{{foreground}}', csscolor(foreground)).replace('{{background}}', csscolor(background)))
    else:
        filename = id + '.png'
        (OUT / filename).write_bytes(png(w, h, p))
    item['file'] = filename
    catalog.append(item)
    variants.append((enum, id))
    provenance.append({'id': id, 'source': summary(r), 'tileSha256': hashlib.sha256((OUT / filename).read_bytes()).hexdigest(), 'originalWidth': r['w'], 'originalHeight': r['h']})
(OUT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
(OUT / 'provenance.json').write_text(json.dumps({'copyright': 'Apple Computer, Inc.', 'sources': ['https://github.com/mihaip/infinite-mac/tree/main/Images', 'https://github.com/mihaip/infinite-mac/releases/download/mac-os-disk-images-2025-11-30/Mac.OS.8.0.HD.dsk.zip'], 'selection': {'included': len(catalog), 'twoColor': sum((x['kind'] == 'two-color' for x in catalog)), 'fixedColor': sum((x['kind'] == 'color' for x in catalog)), 'excluded': [summary(r) for r in excluded], 'deduplication': 'Equal repeating pixels; two-color patterns also merge translations and inverted masks. Related source entries remain recorded.'}, 'patterns': provenance}, ensure_ascii=False, indent=2) + '\n')
(SOURCE / 'variants.ts').write_text('/** Generated by assets:desktop-patterns; edit the source selection instead. */\nexport enum PatternVariant {\n' + ''.join((f'  {enum} = "{id}",\n' for enum, id in variants)) + '}\n')
data = json.dumps(catalog, ensure_ascii=False, indent=2)
(SOURCE / 'catalog.ts').write_text('import { PatternVariant } from "$/components/pattern/variants";\n\nexport enum PatternGroup { System7 = "system7", System75 = "system75", MacOS8 = "macos8" }\nexport enum PatternKind { TwoColor = "two-color", Color = "color" }\nexport interface PatternDefinition {\n  id: PatternVariant; label: string; labelZh: string; group: PatternGroup; kind: PatternKind;\n  width: number; height: number; file: string; sourceVersion: string;\n  svgTemplate?: string; defaultForeground?: string; defaultBackground?: string;\n  hasForeground?: boolean; hasBackground?: boolean;\n}\n/** Generated from the original resource selection by assets:desktop-patterns. */\nexport const PATTERNS = ' + data + ' as readonly PatternDefinition[];\nexport const DEFAULT_PATTERN = PatternVariant.System7Pattern04;\nexport const PATTERN_DEFAULT_FOREGROUND = "#000000";\nexport const PATTERN_DEFAULT_BACKGROUND = "#ffffff";\nexport function patternDefinition(id: PatternVariant): PatternDefinition { return PATTERNS.find(pattern => pattern.id === id)!; }\nexport function normalizePatternColor(value: string): string | undefined {\n  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());\n  return match ? `#${match[1].toLowerCase()}` : undefined;\n}\nexport function patternColorImage(pattern: PatternDefinition, foreground?: string, background?: string): string | undefined {\n  if (!pattern.svgTemplate) return undefined;\n  const svg = pattern.svgTemplate.replaceAll("{{foreground}}", foreground ?? pattern.defaultForeground!).replaceAll("{{background}}", background ?? pattern.defaultBackground!);\n  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;\n}\n')
css = ['.root, :global([data-ui-desktop-pattern]) { background-repeat: repeat; image-rendering: pixelated; }']
for item in catalog:
    props = f"""background-image: url("../../../assets/patterns/macintosh/{item['file']}"); background-size: {item['width'] * 2}px {item['height'] * 2}px;"""
    css.append(f''':global([data-ui-desktop-pattern="{item['id']}"]) {{ {props} }}''')
    image = f"""url("../../../assets/patterns/macintosh/{item['file']}")"""
    if item['kind'] == 'two-color':
        image = f'var(--ui-pattern-override-image, {image})'
    css.append(f''':global([data-ui-pattern-override][data-ui-pattern-override="{item['id']}"]) :global([data-ui-desktop-pattern]:not([data-ui-pattern-preview])) {{ background-image: {image}; background-size: {item['width'] * 2}px {item['height'] * 2}px; }}''')
(SOURCE / 'pattern.module.css').write_text('\n'.join(css) + '\n')
print('Imported', len(catalog), 'native repeating patterns into', OUT)
