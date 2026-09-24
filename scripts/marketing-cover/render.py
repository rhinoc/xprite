#!/usr/bin/env python3
"""Create an editable HTML cover and export it at native pixels with ego-browser."""
from __future__ import annotations
import argparse
import base64
import copy
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess

BASE_SIZE = (1600, 900)
FRAME_RATIO = 868 / 428
PHONE_INSET = 19 / 428
PHONE_STATUS = 44 / 428
PHONE_ADDRESS = 46 / 428
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


def png(path):
    data = path.read_bytes()
    if data[:8] != PNG_SIGNATURE:
        raise ValueError(f'请使用 PNG 原始截图：{path}')
    width, height = struct.unpack('>II', data[16:24])
    return data, (width, height)


def plan(config, path, output):
    width, height = int(config['canvas']['width']), int(config['canvas']['height'])
    base_width,base_height = config.get('base_size',BASE_SIZE)
    scale = min(width / base_width, height / base_height)
    origin = ((width - base_width*scale)/2, (height-base_height*scale)/2)
    px = lambda value: round(value*scale)
    point = lambda x,y: [round(origin[0]+x*scale), round(origin[1]+y*scale)]
    desktop = config['layout']['desktop']
    dx,dy = point(*desktop[:2])
    dw,dh = px(desktop[2]),px(desktop[3])
    mobile = config['layout']['mobile']
    mx,my = point(*mobile[:2])
    mw = px(mobile[2])
    mh = px(mobile[2]*config['phone']['aspect_ratio'])
    inset = px(mobile[2]*PHONE_INSET)
    status,address = [px(mobile[2]*fraction) for fraction in [PHONE_STATUS,PHONE_ADDRESS]]
    output_size=config.get('export',{}).get('size',[width,height])
    resize=output_size!=[width,height]
    return {'config':str(path), 'script':str(Path(__file__).resolve()), 'folder':str(path.parent),
            'url':config['capture']['url'], 'canvas':[width,height], 'scale':scale, 'origin':origin,
            'desktop':{'position':[dx,dy], 'size':[dw,dh], 'bar':px(config['layout'].get('browser_bar_height',44)), 'path':str((path.parent/config['images']['desktop']).resolve())},
            'mobile':{'position':[mx,my], 'body':[mw,mh], 'inset':inset, 'status':status, 'address':address,
                      'size':[mw-2*inset,mh-2*inset-status-address], 'path':str((path.parent/config['images']['mobile']).resolve())},
            'zooms':config['capture'].get('zoom',{'desktop':600,'mobile':300}),
            'html':str(output.with_suffix('.html')), 'output':str(output), 'show_phone':config['style']['show_phone'],
            'language':config.get('language','zh'), 'locale':config.get('locale','zh-CN'),
            'output_size':output_size,'render_output':str(output.with_name(output.stem+'-large.png')) if resize else str(output)}


def prepare_html(config,p):
    folder=Path(p['folder'])
    sources={}
    def image(name,expected=None):
        path=(folder/config['images'][name]).resolve()
        if path.suffix.lower()=='.svg':
            data=path.read_bytes()
            sources[name]={'path':str(path),'format':'svg','sha256':hashlib.sha256(data).hexdigest()}
            return 'data:image/svg+xml;base64,'+base64.b64encode(data).decode()
        data,size=png(path)
        if expected and list(size)!=expected:
            raise ValueError(f'{name} 截图为 {size}，需要原尺寸 {tuple(expected)}。请运行 --capture 现场截取，禁止事后缩放。')
        sources[name]={'path':str(path),'size':list(size),'sha256':hashlib.sha256(data).hexdigest()}
        return 'data:image/png;base64,'+base64.b64encode(data).decode()
    desktop=image('desktop',p['desktop']['size'])
    mobile=image('mobile',p['mobile']['size']) if p['show_phone'] else None
    icon=image('icon')
    font_css=''
    headline_family='inherit'
    if p['language']=='en':
        font=config['fonts'][config['english_font']]
        font_path=Path(font['path'])
        data=font_path.read_bytes()
        sources['english_font']={'path':str(font_path),'family':font['family'],'sha256':hashlib.sha256(data).hexdigest()}
        embedded=base64.b64encode(data).decode()
        font_css=f'@font-face{{font-family:XpriteCover;src:url(data:font/ttf;base64,{embedded}) format("truetype");font-weight:100 900;font-display:block}}'
        headline_family='XpriteCover,Arial,sans-serif'
    s=p['scale']; ox,oy=p['origin']
    px=lambda value:round(value*s)
    point=lambda x,y:(round(ox+x*s),round(oy+y*s))
    e=html.escape
    url=e(config['text']['url'])
    lx,ly,ls=config['layout']['logo']; lx,ly=point(lx,ly); ls=px(ls)
    hx,hy,hw,fs,gap=config['layout']['headline']; hx,hy=point(hx,hy); hw=px(hw)
    lines=config['text']['headline']
    fs=px(fs)
    headline=[]
    keyword=config['text'].get('highlight','')
    for line in lines:
        text=e(line)
        if keyword:text=text.replace(e(keyword),'<mark>'+e(keyword)+'</mark>')
        headline.append('<div>'+text+'</div>')
    fx,fy,ff=config['layout']['footer']; fx,fy=point(fx,fy)
    d=p['desktop']; dw,dh=d['size']; dx,dy=d['position']; bar=d['bar']
    m=p['mobile']; mw,mh=m['body']; mx,my=m['position']; sw,sh=m['size']; inset=m['inset']
    phone=''
    if mobile:
        phone=f'''<div class="phone" style="left:{mx}px;top:{my}px;width:{mw}px;height:{mh}px;--inset:{inset}px;--screen-width:{sw}px;--screen-height:{mh-2*inset}px;--radius:{round(mw*68/428)}px;--screen-radius:{round(mw*49/428)}px">
        <div class="side volume"></div><div class="side power"></div><div class="screen">
        <div class="status" style="height:{m['status']}px"><span>9:41</span><i></i></div>
        <div class="mobile-address" style="height:{m['address']}px"><span>{url}</span></div>
        <img class="photo mobile-photo" src="{mobile}" alt="真实手机截图"></div></div>'''
    arrow=''
    if config['style']['show_arrow']:
        paths=''.join(f'<path d="{e(item)}"/>' for item in config['layout'].get('arrow_paths',['M365 246 C405 290 446 283 477 272','M461 266 L477 272 L467 286']))
        arrow=f'''<svg class="arrow" width="{p['canvas'][0]}" height="{p['canvas'][1]}" xmlns="http://www.w3.org/2000/svg"><g transform="translate({ox} {oy}) scale({s})" fill="none" stroke="{e(config['style']['arrow'])}" stroke-width="{config['layout'].get('arrow_width',5)}" stroke-linecap="round" stroke-linejoin="round">{paths}</g></svg>'''
    browser_icons=''
    if config['style'].get('show_browser_icons',False):
        ix,iy,icon_size,icon_gap=config['layout']['browser_icons'];ix,iy=point(ix,iy)
        items=''.join(f'<img src="{image(name)}" alt="{e(name.capitalize())}" width="{px(icon_size)}" height="{px(icon_size)}">' for name in config.get('browser_icons',[]))
        browser_icons=f'<div class="browser-icons" style="left:{ix}px;top:{iy}px;gap:{px(icon_gap)}px">{items}</div>'
    github_link=''
    if config['style'].get('show_github_link',False):
        gx,gy,font_size,icon_size,icon_gap=config['layout']['github_link'];gx,gy=point(gx,gy)
        github_url=config['text']['github_url']
        github_label=e(github_url.removeprefix('https://').removeprefix('http://'))
        github_link=f'<a class="github-link" href="{e(github_url)}" style="left:{gx}px;top:{gy}px;font-size:{px(font_size)}px;gap:{px(icon_gap)}px"><img src="{image("github")}" alt="GitHub" width="{px(icon_size)}" height="{px(icon_size)}"><span>{github_label}</span></a>'
    desktop_cursor=''
    if config['style'].get('show_desktop_cursor',False):
        cx,cy,cursor_size=config['layout']['desktop_cursor']
        desktop_cursor=f'<img class="desktop-cursor" src="{image("cursor")}" alt="Xprite cursor" style="left:{px(cx)}px;top:{bar+px(cy)}px;width:{px(cursor_size)}px;height:{px(cursor_size)}px">'
    content=f'''<!doctype html><html lang="{e(p['locale'])}"><meta charset="utf-8"><title>Xprite Cover</title><style>
    {font_css}
    *{{box-sizing:border-box}}html,body{{margin:0;width:{p['canvas'][0]}px;height:{p['canvas'][1]}px;overflow:hidden;background:{e(config['canvas']['background'])};font-family:{headline_family if p['language']=='en' else '-apple-system,"PingFang SC","Heiti SC",Arial,sans-serif'};color:{e(config['style']['text'])}}}
    .brand{{position:absolute;left:{lx}px;top:{ly}px;height:{ls}px;display:flex;align-items:flex-end;gap:{px(12)}px}}
    .brand img{{width:{ls}px;height:{ls}px;image-rendering:pixelated;border-radius:{px(15)}px}}
    .brand span{{font-family:Arial,sans-serif;font-weight:700;font-size:{px(config['layout']['wordmark_size'])}px;line-height:.88;padding-bottom:{round(ls*.17)}px}}
    .headline{{position:absolute;left:{hx}px;top:{hy}px;width:{hw}px;font-size:{fs}px;font-family:{headline_family};font-weight:{config['fonts'][config['english_font']]['weight'] if p['language']=='en' else 750};line-height:1.16}}
    .headline>div{{white-space:nowrap}}
    .headline>div+div{{margin-top:{px(gap)}px}}mark{{background:{e(config['style']['highlight'])};color:inherit;padding:0 {px(2)}px}}
    .footer{{position:absolute;left:{fx}px;top:{fy}px;font-size:{px(ff)}px}}
    .github-link{{position:absolute;display:flex;align-items:center;white-space:nowrap;color:inherit;text-decoration:none}}
    .github-link img{{display:block}}.desktop-cursor{{position:absolute;pointer-events:none;image-rendering:pixelated}}
    .browser{{position:absolute;left:{dx}px;top:{dy}px;width:{dw}px;box-sizing:content-box;border:1px solid #41464d;border-radius:{px(13)}px;overflow:hidden;box-shadow:0 {px(10)}px {px(20)}px #0002}}
    .browser-bar{{height:{bar}px;background:#f2f3f5;display:flex;align-items:center;padding:0 {px(15)}px;gap:{px(8)}px}}
    .dot{{width:{px(12)}px;height:{px(12)}px;border-radius:50%;background:#ff6259}}.dot.yellow{{background:#ffbe2e}}.dot.green{{background:#2bc841}}
    .address{{margin-left:{px(config['layout'].get('address_margin',60))}px;background:#e5e7ea;border-radius:999px;padding:{px(3)}px {px(16)}px;flex:1;font-size:{px(config['layout'].get('address_font_size',17))}px;height:{round(bar*.66)}px;display:flex;align-items:center}}
    .photo{{display:block;max-width:none;max-height:none;image-rendering:auto}}
    .phone{{position:absolute;background:{e(config['style']['phone_frame'])};border-radius:var(--radius);box-shadow:inset 0 0 0 2px {e(config['style']['phone_rim'])},0 {px(10)}px {px(20)}px #0002}}
    .screen{{position:absolute;left:var(--inset);top:var(--inset);width:var(--screen-width);height:var(--screen-height);overflow:hidden;border-radius:var(--screen-radius);background:#f4f5f7}}
    .status{{position:relative;font:600 {px(config['phone']['time_font_size'])}px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-.2px}}.status span{{position:absolute;left:{px(20)}px;top:50%;transform:translateY(-50%)}}
    .status i{{position:absolute;top:{px(3)}px;left:50%;transform:translateX(-50%);width:{round(mw*120/428)}px;height:{round(mw*24/428)}px;background:#111;border-radius:20px}}
    .mobile-address{{padding:{px(4)}px {px(config['phone']['address_inset'])}px}}.mobile-address span{{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#e3e5e8;border-radius:{px(config['phone']['address_radius'])}px;font:400 {px(config['phone']['address_font_size'])}px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}}
    .side{{position:absolute;background:#4d5157;width:{px(3)}px;border-radius:2px}}.volume{{left:-2px;top:27%;height:17%}}.power{{right:-2px;top:35%;height:18%}}
    .arrow{{position:absolute;left:0;top:0;pointer-events:none}}
    .browser-icons{{position:absolute;display:flex;align-items:center}}.browser-icons img{{display:block;object-fit:contain}}
    </style><body><div class="brand"><img src="{icon}" alt="XP"><span>{e(config['text']['wordmark_suffix'])}</span></div>
    <div class="headline">{''.join(headline)}</div><div class="footer">{e(config['text']['footer'])}</div>{github_link}
    <div class="browser"><div class="browser-bar"><i class="dot"></i><i class="dot yellow"></i><i class="dot green"></i><span class="address">{url}</span></div><img class="photo" src="{desktop}" alt="真实桌面截图">{desktop_cursor}</div>
    {phone}{arrow}{browser_icons}<script>
    document.fonts.ready.then(() => {{
      const heading=document.querySelector('.headline');
      const style=getComputedStyle(heading);
      const maxSize=parseFloat(style.fontSize);
      const context=document.createElement('canvas').getContext('2d');
      context.font=style.fontWeight+' '+maxSize+'px '+style.fontFamily;
      const width=Math.max(...Array.from(heading.children,line=>context.measureText(line.textContent).width));
      const available=parseFloat(style.width)-{px(4)};
      heading.style.fontSize=Math.floor(Math.min(maxSize,maxSize*available/width))+'px';
      document.documentElement.dataset.coverReady='true';
    }});
    </script></body></html>'''
    target=Path(p['html']);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
    manifest={'renderer':'Native Chromium HTML/SVG composition','config':p['config'],'output':p['output'],'canvas':p['output_size'],'render_canvas':p['canvas'],
              'device_scale_factor':1,'screenshot_resizing':False,'final_image_resizing':p['canvas']!=p['output_size'],'inputs':sources,'phone_aspect_ratio':config['phone']['aspect_ratio'],
              'language':p['language'],'locale':p['locale'],'layout':config.get('layout_name','wide')}
    target.with_name('source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return target


def size_argument(value):
    match=re.fullmatch(r'(\d+)[xX×](\d+)',value)
    if not match or min(map(int,match.groups()))<1:
        raise argparse.ArgumentTypeError('尺寸格式为 WIDTHxHEIGHT，例如 630x500，宽高必须为正整数。')
    return tuple(map(int,match.groups()))


def make_job(source,configuration,size,language,layout_name,output_override):
    config=copy.deepcopy(source)
    width,height=size
    config['canvas'].update(width=width,height=height)
    config['language']=language
    config['locale']='en' if language=='en' else 'zh-CN'
    config['text'].update(config.get('translations',{}).get(language,{}))
    chosen=('wide' if width/height>=1.5 else 'compact') if layout_name=='auto' else layout_name
    config['layout_name']=chosen
    variant=config.get('layout_variants',{}).get(chosen,{})
    for key in ['layout','phone','style','capture']:
        config[key].update(variant.get(key,{}))
    config['layout'].update(config.get('language_layouts',{}).get(language,{}))
    config['layout'].update(variant.get('language_layouts',{}).get(language,{}))
    config['base_size']=variant.get('base_size',list(BASE_SIZE))
    render_width=max(width,round(config['base_size'][0]*1.2))
    config['canvas'].update(width=render_width,height=round(height*render_width/width))
    config['export']={'size':[width,height]}
    for key,value in config['images'].items():
        config['images'][key]=str((configuration.parent/value).resolve())
    for font in config.get('fonts',{}).values():
        font['path']=str((configuration.parent/font['path']).resolve())
    folder=configuration.parent/'output'/f'{width}x{height}'/language
    output=output_override.resolve() if output_override else folder/f'xprite-cover-{language}.png'
    folder=output.parent
    folder.mkdir(parents=True,exist_ok=True)
    for name in ['desktop','mobile']:
        config['images'][name]=str(folder/f'{name}.png')
    config['capture']['url']=config['capture'].get('urls',{}).get(language,config['capture']['url'])
    config['output']=str(output)
    config_path=output.with_suffix('.config.json') if output_override else folder/'config.json'
    config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    p=plan(config,config_path,output)
    reused=[]
    for name in ['desktop','mobile'] if p['show_phone'] else ['desktop']:
        target=Path(p[name]['path'])
        shared=configuration.parent/'output'/'1920x1080'/language/f'{name}.png'
        if shared!=target and shared.exists() and list(png(shared)[1])==p[name]['size']:
            if not target.exists() or list(png(target)[1])!=p[name]['size']:
                shutil.copyfile(shared,target)
                reused.append(name)
    record=configuration.parent/'output'/'1920x1080'/language/'capture-record.json'
    if len(reused)==(2 if p['show_phone'] else 1) and record.exists():
        shutil.copyfile(record,folder/'capture-record.json')
    plan_path=output.with_suffix('.plan.json') if output_override else folder/'capture-plan.json'
    plan_path.write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
    return config,p,plan_path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=Path(__file__).with_name('config.json'))
    parser.add_argument('--output',type=Path)
    parser.add_argument('--capture',action='store_true',help='现场重新截取网页')
    parser.add_argument('--html-only',action='store_true',help='仅生成模板，不打开浏览器')
    parser.add_argument('--size',type=size_argument,action='append',help='自定义尺寸，例如 630x500；可重复指定')
    parser.add_argument('--preset',choices=['itch'],help='itch = 630x500')
    parser.add_argument('--language',choices=['zh','en','both'],default='both',help='默认同时生成中英文')
    parser.add_argument('--layout',choices=['auto','wide','compact'],default='auto')
    parser.add_argument('--resolved',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args(); configuration=args.config.resolve(); source=json.loads(configuration.read_text())
    if args.resolved and args.html_only:
        output=args.output.resolve() if args.output else (configuration.parent/source['output']).resolve()
        print(prepare_html(source,plan(source,configuration,output)))
        return
    sizes=args.size or ([(630,500)] if args.preset=='itch' else [(source['canvas']['width'],source['canvas']['height'])])
    languages=['zh','en'] if args.language=='both' else [args.language]
    if args.output and len(sizes)*len(languages)!=1:
        parser.error('--output 需要指定单一尺寸及 --language zh 或 en；批量输出自动分目录保存。')
    jobs=[]
    for size in sizes:
        for language in languages:
            config,p,plan_path=make_job(source,configuration,size,language,args.layout,args.output)
            needs_capture=args.capture
            for name in ['desktop','mobile'] if p['show_phone'] else ['desktop']:
                path=Path(p[name]['path'])
                if not path.exists() or list(png(path)[1])!=p[name]['size']:
                    needs_capture=True
            if args.html_only:
                print(prepare_html(config,p))
            elif not needs_capture:prepare_html(config,p)
            jobs.append({'plan':str(plan_path),'capture':needs_capture})
    if args.html_only:return
    request={'jobs':jobs,'spaceId':os.environ.get('XPRITE_COVER_SPACE')}
    script='globalThis.xpriteCoverRun='+json.dumps(request)+';\n'+Path(__file__).with_name('capture.mjs').read_text()
    subprocess.run(['ego-browser','nodejs'],input=script,text=True,check=True)
    for job in jobs:print(json.loads(Path(job['plan']).read_text())['output'])


if __name__=='__main__':main()
