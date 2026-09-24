#!/usr/bin/env python3
"""Bundle the existing covers and fonts into an offline, draggable cover editor."""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def data_url(path):
    path = Path(path)
    mime = {'.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf'}[path.suffix]
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def main():
    settings = json.loads((ROOT / 'config.json').read_text())
    assets = {name: data_url(ROOT / value) for name, value in settings['images'].items()
              if name not in ['desktop', 'mobile']}
    fonts = {key: {**font, 'data': data_url(ROOT / font['path'])}
             for key, font in settings['fonts'].items()}
    templates = {}
    for size in ['630x500', '1920x1080']:
        for language in ['zh', 'en']:
            folder = ROOT / 'output' / size / language
            c = json.loads((folder / 'config.json').read_text())
            p = json.loads((folder / 'capture-plan.json').read_text())
            width, height = p['output_size']
            factor = width / p['canvas'][0]
            scale = p['scale'] * factor
            ox, oy = [value * factor for value in p['origin']]
            point = lambda x, y: (x * scale + ox, y * scale + oy)
            layers = []

            def add(identifier, kind, name, x, y, w, h, **extra):
                layers.append({'id': identifier, 'kind': kind, 'name': name, 'x': x, 'y': y,
                               'w': w, 'h': h, 'visible': True, 'locked': False, **extra})

            font = c.get('english_font', 'spacegrotesk') if language == 'en' else 'system'
            for role in ['desktop', 'mobile']:
                assets[f'{role}_{language}'] = data_url(c['images'][role])
            lx, ly, size_value = c['layout']['logo']
            x, y = point(lx, ly)
            add('brand', 'brand', 'Logo & name', x, y, size_value * scale * 2.1,
                size_value * scale, asset='icon', text=c['text']['wordmark_suffix'],
                font='Arial', fontSize=c['layout']['wordmark_size'] * scale, color=c['style']['text'])
            hx, hy, hw, fs, gap = c['layout']['headline']
            x, y = point(hx, hy)
            add('headline', 'text', 'Headline', x, y, hw * scale, fs * scale * 2.5,
                text='\n'.join(c['text']['headline']), font=font,
                fontSize=fs * scale, weight=fonts[font]['weight'] if font != 'system' else 750,
                lineHeight=1.16, lineGap=gap * scale, color=c['style']['text'],
                highlight=c['text']['highlight'], highlightColor=c['style']['highlight'], fit=True)
            fx, fy, fs = c['layout']['footer']
            x, y = point(fx, fy)
            add('footer', 'text', 'Free & open source', x, y, 250 * scale, fs * scale * 1.25,
                text=c['text']['footer'], font=font, fontSize=fs * scale, weight=400,
                lineHeight=1.2, lineGap=0, color=c['style']['text'], highlight='', fit=False)
            gx, gy, fs, icon_size, gap = c['layout']['github_link']
            x, y = point(gx, gy)
            add('github', 'github', 'GitHub link', x, y, 400 * scale, icon_size * scale,
                asset='github', text=c['text']['github_url'].removeprefix('https://'),
                font=font, fontSize=fs * scale, weight=400, iconSize=icon_size * scale,
                gap=gap * scale, color=c['style']['text'])
            d = p['desktop']
            add('desktop', 'desktop', 'Desktop', *(value * factor for value in d['position']),
                d['size'][0] * factor, (d['size'][1] + d['bar']) * factor,
                asset=f'desktop_{language}', address=c['text']['url'], bar=d['bar'] * factor)
            mx, my = p['mobile']['position']
            mw, mh = p['mobile']['body']
            add('mobile', 'phone', 'Phone', mx * factor, my * factor, mw * factor, mh * factor,
                asset=f'mobile_{language}', address=c['text']['url'],
                inset=p['mobile']['inset'] / mw, status=p['mobile']['status'] / mw,
                addressHeight=p['mobile']['address'] / mw)
            cx, cy, cs = c['layout']['desktop_cursor']
            add('cursor', 'image', 'Pixel cursor', (d['position'][0] + cx * p['scale']) * factor,
                (d['position'][1] + d['bar'] + cy * p['scale']) * factor,
                cs * scale, cs * scale, asset='cursor')
            if c['layout_name'] == 'compact':
                ax, ay = point(340, 190)
            else:
                ax, ay = point(360, 240)
            add('arrow', 'arrow', 'Arrow', ax, ay, 110 * scale, 48 * scale,
                color=c['style']['arrow'], start={'x':5/110,'y':5/48}, end={'x':105/110,'y':25/48}, curvature=.28, strokeWidth=5*scale)
            ix, iy, icon_size, gap = c['layout']['browser_icons']
            for index, browser in enumerate(c['browser_icons']):
                x, y = point(ix + index * (icon_size + gap), iy)
                add(browser, 'image', browser.capitalize(), x, y, icon_size * scale,
                    icon_size * scale, asset=browser)
            templates[f'{size}-{language}'] = {'width': width, 'height': height,
                'background': c['canvas']['background'], 'layers': layers, 'language': language}
    bundle = {'assets': assets, 'fonts': fonts, 'templates': templates,
              'defaultTemplate': '630x500-en'}
    source = (ROOT / 'cover-editor.template.html').read_text()
    payload = json.dumps(bundle, ensure_ascii=False).replace('</', '<\\/')
    target = ROOT / 'cover-editor.html'
    target.write_text(source.replace('__COVER_BUNDLE__', payload))
    print(target)


if __name__ == '__main__':
    main()
