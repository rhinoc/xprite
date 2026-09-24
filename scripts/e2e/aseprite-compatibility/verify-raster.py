#!/usr/bin/env python3
"""Compare software sampling against Pillow BILINEAR for alpha and global grid phase."""
import json
from pathlib import Path
import random
import subprocess
import tempfile
from PIL import Image
root = Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix='aseprite-raster-') as folder:
    temporary = Path(folder)
    subprocess.run(['pnpm', 'exec', 'tsgo', 'packages/ui/src/components/canvas-surface/geometry.ts', '--outDir', folder, '--target', 'ES2020', '--module', 'commonjs', '--skipLibCheck'], cwd=root, check=True)
    random.seed(123)
    cases = []
    for x, y, width, height in [(0, 0, 31, 23), (5, 4, 20, 12)]:
        source = Image.new('RGBA', (width, height))
        source.putdata([tuple(random.randrange(256) for _ in range(4)) for _ in range(width * height)])
        full = Image.new('RGBA', (31, 23))
        full.paste(source, (x, y))
        resized = full.resize((19, 14), Image.Resampling.BILINEAR)
        left, top = x * 19 // 31, y * 14 // 23
        right, bottom = -(-(x + width) * 19 // 31), -(-(y + height) * 14 // 23)
        cases.append(dict(bounds=dict(x=x, y=y, width=width, height=height), pixels=list(source.tobytes()), expected=list(resized.crop((left, top, right, bottom)).tobytes())))
    (temporary / 'cases.json').write_text(json.dumps(cases))
    (temporary / 'check.cjs').write_text('''
global.ImageData = class { constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); } };
const { resampleRasterSurface } = require('./geometry.js');
for (const test of require('./cases.json')) {
  const input = new ImageData(test.bounds.width, test.bounds.height); input.data.set(test.pixels);
  const output = resampleRasterSurface(input, test.bounds, { sceneWidth: 31, sceneHeight: 23, width: 19, height: 14 });
  const difference = output.data.reduce((n, value, index) => n + (value !== test.expected[index]), 0);
  if (difference) throw new Error(`${difference} channel mismatches`);
}
console.log('PASS: Aseprite raster matches Pillow exactly for full and offset alpha surfaces.');
''')
    subprocess.run(['node', str(temporary / 'check.cjs')], check=True)
