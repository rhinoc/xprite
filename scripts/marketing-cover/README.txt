Xprite 原尺寸封面生成器

依赖 Python 3、ego-browser CLI、macOS sips；独立生成宣传素材，不进入编辑器构建流程。

在仓库根目录运行（默认同时输出中英文）：
  python3 scripts/marketing-cover/render.py

itch 尺寸 630x500：
  python3 scripts/marketing-cover/render.py --preset itch

自定义尺寸：
  python3 scripts/marketing-cover/render.py --size 1200x900

一次生成多个尺寸：
  python3 scripts/marketing-cover/render.py --size 1920x1080 --size 630x500

仅输出英文：
  python3 scripts/marketing-cover/render.py --size 630x500 --language en

强制更新网页截图：
  python3 scripts/marketing-cover/render.py --preset itch --capture

只修改文字后：
  python3 scripts/marketing-cover/render.py --preset itch

只生成自包含 HTML，使用已存在的原尺寸截图：
  python3 scripts/marketing-cover/render.py --preset itch --html-only

自定义单个输出文件：
  python3 scripts/marketing-cover/render.py --size 630x500 --language en --output /absolute/path/cover.png

--config /absolute/path/config.json 可指定其他配置。

尺寸与排版：
- --size WIDTHxHEIGHT 可重复指定；--preset itch 使用 630x500。
- 没有尺寸参数时，读取 config.json 的 canvas.width/height，默认为 1920x1080。
- --layout auto 根据宽高比选择原版或位置微调版；--layout wide / compact 可固定选择。
- 两版保留原版左右构图、设备比例和网页视口；compact 使用 1120x888.89 的参考画布，保留设备比例并减小 630x500 的上下边距，电脑窗口右侧延伸到画布外。
- 不同输出比例保留左右构图；不把品牌和文案重排到上方。
- 先生成较大的完整封面，再使用 sips 将整张图片等比例缩小到目标尺寸。
- 网页截图在大图模板中按原始像素显示；只有整张最终封面缩小，不用窄小网页视口重新截图。
- 新尺寸没有对应截图或尺寸不匹配时，会自动现场截取；已有素材直接复用，--capture 强制更新。

中英文：
- --language both（默认）/ zh / en。
- text 配置默认中文文案和共享品牌、网址；translations.en 配置英文标题、强调词和免费开源说明。
- 英文版截取英文界面，中文版截取中文界面。两版素材分别保存。
- capture.url / capture.urls 控制实际截图地址；默认复用现有本地服务。
- *.localhost 截图使用按语言、设备、视口区分的独立域名，以隔离浏览器存储及画布视图，不操作正常使用页面。
- capture.zoom 控制编辑器画布缩放，不是图片缩放；紧凑版可单独设置。

输出目录：
  output/<宽>x<高>/<zh 或 en>/
每个目录包括 xprite-cover-zh/en.png、缩小前的 -large.png（如需缩小）、同名大图 HTML、config.json、desktop.png、mobile.png，以及 capture-plan.json、capture-record.json 和 source-manifest.json。
manifest 记录最终尺寸、渲染尺寸、是否整图缩小、素材 SHA-256、界面语言和布局；截图记录包含实际访问地址和时间。

布局和素材：
- layout.desktop：[x,y,width,height]；height 是网页内容高度，不包括浏览器框。
- layout.mobile：[x,y,width]；phone.aspect_ratio 控制固定手机外框比例。
- layout.logo / headline / footer 控制品牌与文案布局。
- images 配置素材路径，可用 PNG 或 SVG 图标；PNG 截图必须与目标原尺寸一致。
- browser_icons 控制浏览器图标顺序；style.show_browser_icons 可关闭；layout.browser_icons：[x,y,size,gap]。
- text.github_url 是完整仓库网址，显示时省略 https://；HTML 中可点击。
- style.show_github_link / show_desktop_cursor 控制 GitHub 地址和 cursor 叠层。
- layout.github_link：[x,y,文字字号,图标尺寸,间距]。
- layout.desktop_cursor：[x,y,size]；x/y 相对于桌面网页内容区。
- phone.time_font_size / address_font_size 控制时间、网址字号；address_inset 控制地址栏缩进；address_radius=999 为 pill。
- 手机底部不额外预留横线和背景，真实截图填满剩余高度。

手机外框参考 Devices.css；素材及许可见 NOTICE.txt。

英文字体：默认 Space Grotesk 700。english_font 可以改为 manrope（800）或 sora（700）；fonts 保存字体路径、名称与字重。字体嵌入宣传 HTML，不加入编辑器依赖。
浏览器按实际字体字宽计算标题字号。language_layouts.en 设置常规英文布局，layout_variants.compact.language_layouts.en 设置 630x500 英文微调。
output/font-preview.png / .html 提供三款字体的实际文案对比，相关许可证位于 third-party/。

独立封面编辑器：
- cover-editor.html：自包含离线网页，直接用浏览器打开。
- 可以拖动、缩放图层，编辑文字、字体、字号及颜色，替换截图，切换中英文和尺寸。
- 右侧属性栏顶部的 Canvas → Background 可修改当前封面的背景色，选中图层时也可使用。修改即时预览，支持撤销/重做，并随布局保存及 PNG 导出。
- PNG 从 sRGB 画布直接输出；像素截图关闭平滑缩放；1x 输出画布原尺寸，2x / 3x 提供更高分辨率。
- 自动保存在本网页的浏览器存储中；「保存布局」和「打开布局」用于 JSON 文件。
- 更新脚本素材后，运行 python3 scripts/marketing-cover/make_editor.py 重新嵌入当前封面及字体。
- 模板源文件为 cover-editor.template.html；独立于主编辑器代码、构建和运行流程。

Cover Studio controls:
- Canvas → Background at the top of the right properties panel changes the current cover's background, including while a layer is selected. Changes preview immediately, support Undo/Redo, and are included in saved layouts and PNG exports.
- Arrow: drag Start, End or Curve handles; coordinates, curvature and stroke are editable.
- Snap: canvas edges, centers, halves/thirds/quarters and nearby layer edges/centers. Applies to movement, corner resizing and arrow handles. Hold Alt to bypass.
- To front / To back: buttons or Cmd/Ctrl+Shift+] / Cmd/Ctrl+Shift+[.
- Interface language is English; English and Chinese cover presets remain available.
- Layout files and browser autosave use schema 2. No old-format migration or compatibility layer.

Reuse a layout across languages:
- Apply layout imports the active document from a saved layout into the currently selected cover. It retains the current language, corresponding screenshot assets and existing translated text matched by layer ID.
- Copy to English / Copy to Chinese applies the same layout directly to the other-language cover. No file round-trip is needed.
- Positions, image sizes, colors, visibility and layer order follow the source layout. New text layers retain their source text until edited in the target language.
- Open project restores an entire saved project, including its active cover.
