#!/usr/bin/env python3
"""Convert upstream delimiter-based bitmap font to faithful glyph atlas + WOFF2.
Requires fonttools, Pillow, brotli. Usage: python script.py /path/to/aseprite_font.png
Matches laf/text/sprite_sheet_typeface.cpp findGlyph and codepoint - 32 mapping.
"""
import sys, json
from pathlib import Path
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
root = Path(__file__).resolve().parents[3]
output = root / 'packages/ui/assets/fonts/aseprite'
output.mkdir(parents=True, exist_ok=True)
source = Path(sys.argv[1])
im = Image.open(source).convert('RGBA')
key = im.getpixel((0,0))
x=y=0; h=1; glyphs=[]
while y < im.height:
    while y < im.height and im.getpixel((x,y)) == key:
        x+=1
        if x >= im.width: x=0; y+=h; h=1
    if y>=im.height: break
    first=im.getpixel((x,y)); w=0; h=0
    while x+w<im.width and im.getpixel((x+w,y))!=key: w+=1
    while y+h<im.height and im.getpixel((x,y+h))!=key: h+=1
    glyphs.append(None if first==(255,0,0,255) else [x,y,w,h])
    x+=w
    if x>=im.width: x=0; y+=h; h=1
height=glyphs[0][3]; descent=2; unit=64
atlas=Image.new('RGBA',im.size)
metrics={}; outlines={}; widths={}; cmap={}; names=['.notdef']
pen=TTGlyphPen(None); outlines['.notdef']=pen.glyph(); widths['.notdef']=(6*unit,0)
for i, bounds in enumerate(glyphs):
    if bounds is None: continue
    cp=i+32; x,y,w,h=bounds; name=f'uni{cp:04X}'; names.append(name); cmap[cp]=name; metrics[str(cp)]=bounds
    pen=TTGlyphPen(None)
    for py in range(h):
        for px in range(w):
            c=im.getpixel((x+px,y+py))
            if c[3] and c[:3]==(0,0,0):
                atlas.putpixel((x+px,y+py),(255,255,255,255))
                left=px*unit; top=(height-descent-py)*unit
                pen.moveTo((left,top)); pen.lineTo((left+unit,top)); pen.lineTo((left+unit,top-unit)); pen.lineTo((left,top-unit)); pen.closePath()
    outlines[name]=pen.glyph(); widths[name]=(w*unit,0)
fb=FontBuilder(height*unit,isTTF=True)
fb.setupGlyphOrder(names); fb.setupCharacterMap(cmap); fb.setupGlyf(outlines); fb.setupHorizontalMetrics(widths)
fb.setupHorizontalHeader(ascent=(height-descent)*unit,descent=-descent*unit,lineGap=0)
fb.setupNameTable({'familyName':'Aseprite','styleName':'Regular','uniqueFontIdentifier':'AsepriteBitmapResearch','fullName':'Aseprite Bitmap','psName':'AsepriteBitmap'})
fb.setupOS2(sTypoAscender=(height-descent)*unit,sTypoDescender=-descent*unit,sTypoLineGap=0,usWinAscent=(height-descent)*unit,usWinDescent=descent*unit)
fb.setupPost(); fb.setupMaxp(); fb.font.flavor='woff2'; fb.save(output/'aseprite.woff2')
atlas.save(output/'aseprite-glyphs.webp', lossless=True, exact=True, method=6)
(output/'aseprite-glyphs.json').write_text(json.dumps(metrics,separators=(',',':'))+'\n')
print(f'{len(metrics)} glyphs; source height {height}; widths i={metrics["105"][2]}, W={metrics["87"][2]}; output WOFF2 and bitmap atlas')
