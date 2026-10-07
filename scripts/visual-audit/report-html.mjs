import fs from "node:fs";

const escape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const percent = (value) => `${(value * 100).toFixed(3)}%`;
const captureTime = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "未知";
const embed = (filename) =>
  filename && fs.existsSync(filename)
    ? `data:image/png;base64,${fs.readFileSync(filename).toString("base64")}`
    : null;

/** A portable, read-only image report; it never changes gate results or baseline pixels. */
export function writeImageReport(filename, { title, notice, cases }) {
  const counts = {
    changed: cases.filter((entry) => entry.changed).length,
    unchanged: cases.filter((entry) => entry.changed === false).length,
    unavailable: cases.filter((entry) => entry.changed === undefined).length,
  };
  const cards = cases.map((entry, index) => {
    const images = [entry.reference, entry.candidate, entry.diff].map(embed);
    const status = entry.changed === undefined ? "无法比较" : entry.changed ? "有变化" : "图像相同";
    const kind = entry.changed === undefined ? "unavailable" : entry.changed ? "changed" : "same";
    const figures = images
      .map(
        (src, imageIndex) =>
          `<figure><figcaption>${escape(
            [entry.referenceLabel ?? "基线", entry.candidateLabel ?? "候选", "红色像素差异"][
              imageIndex
            ],
          )}</figcaption>${
            src
              ? `<button class="image-button" data-image="${index}-${imageIndex}" aria-label="放大 ${escape(entry.name)} ${imageIndex + 1}"><img src="${src}" loading="lazy" alt="${escape(entry.name)} ${imageIndex + 1}"></button>`
              : `<div class="missing">${imageIndex === 2 && entry.changed === false ? "没有像素差异" : "未生成图像"}</div>`
          }</figure>`,
      )
      .join("");
    const metrics =
      entry.similarity === undefined
        ? ""
        : `<span>变化 ${percent(1 - entry.similarity)}</span><span>相似度 ${percent(entry.similarity)}</span><span>${entry.differentPixels.toLocaleString("en-US")} / ${entry.totalPixels.toLocaleString("en-US")} 像素</span>`;
    const regions = entry.regions?.length
      ? `<details><summary>区域位置与尺寸 (${entry.regions.filter((region) => region.changed).length} 处变化)</summary><table><thead><tr><th>区域</th><th>几何</th><th>基线位置与尺寸</th><th>候选位置与尺寸</th></tr></thead><tbody>${entry.regions
          .map(
            (region) =>
              `<tr><td>${escape(region.name)}</td><td>${
                region.changed ? "有变化" : "一致"
              }</td><td>${escape(region.before)}</td><td>${escape(region.after)}</td></tr>`,
          )
          .join("")}</tbody></table></details>`
      : "";
    return `<article class="case" data-kind="${kind}" data-search="${escape(entry.name.toLowerCase())}">
      <div class="case-title"><h2>${escape(entry.name)}</h2><span class="badge ${kind}">${status}</span></div>
      <div class="metrics">${metrics}<span>区域几何：${entry.geometrySame === undefined ? "无法确认" : entry.geometrySame ? "一致" : "有变化"}</span></div>
      <p class="capture">采集时间（北京时间）：${escape(captureTime(entry.capturedAt))}</p>
      ${entry.warnings?.length ? `<ul class="warnings">${entry.warnings.map((warning) => `<li>${escape(warning)}</li>`).join("")}</ul>` : ""}
      <div class="images">${figures}</div>${regions}
    </article>`;
  });
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#172334;font:15px/1.55 system-ui,sans-serif}header,main{max-width:1600px;margin:auto;padding:24px}h1{margin:0 0 12px;font-size:28px}h2{margin:0;font-size:18px}.summary{display:flex;gap:12px;flex-wrap:wrap}.summary span,.badge{border-radius:6px;padding:4px 10px;background:#e4eaf1}.toolbar{position:sticky;top:0;z-index:1;background:#f4f5f7;border-block:1px solid #cbd3dc;padding:12px 24px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}input,select,button{font:inherit}input,select{border:1px solid #adb9c7;border-radius:4px;padding:6px 10px}input{min-width:240px}.case{margin:0 0 24px;padding:20px;background:white;border:1px solid #cbd3dc;border-radius:8px}.case-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.changed{background:#fff0cd;color:#744100}.same{background:#e0f3e6;color:#205d37}.unavailable{background:#fde7e7;color:#8b2525}.metrics{display:flex;gap:20px;flex-wrap:wrap;margin-top:10px}.capture{font-size:13px;color:#586577}.warnings,.notice{background:#fff5dc;padding:12px 16px;border-left:4px solid #c68416}.warnings{padding-left:32px}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;min-width:0}figcaption{font-weight:600;margin:10px 0}.image-button{display:block;width:100%;padding:0;background:#e9edf1;border:1px solid #b9c4cf;cursor:zoom-in}.image-button img{display:block;width:100%;height:auto;image-rendering:pixelated}.missing{padding:32px;background:#edf0f4;color:#677588;text-align:center}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;border-bottom:1px solid #d9dfe6;padding:8px}details{margin-top:14px}summary{cursor:pointer}[hidden]{display:none!important}dialog{width:calc(100vw - 32px);height:calc(100vh - 32px);max-width:none;max-height:none;border:0;padding:0;background:#eef1f5}dialog::backdrop{background:#0009}.viewer-toolbar{position:sticky;top:0;background:#fff;display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid #cbd3dc}.viewer-images{padding:16px;overflow:auto}.viewer-image{display:block;max-width:none;image-rendering:pixelated}.viewer-image.fit{max-width:100%;height:auto}button.control{padding:6px 12px;border:1px solid #aeb9c5;border-radius:4px;background:white;cursor:pointer}.empty{text-align:center;padding:36px;color:#677588}@media(max-width:800px){.images{grid-template-columns:1fr}.toolbar{position:static}header,main{padding:16px}}
</style></head><body><header><h1>${escape(title)}</h1><div class="summary"><span>${cases.length} 个场景</span><span>有变化 ${counts.changed}</span><span>图像相同 ${counts.unchanged}</span><span>无法比较 ${counts.unavailable}</span></div><p class="notice">${escape(notice)}</p></header>
<div class="toolbar"><label>显示 <select id="filter"><option value="all">全部场景</option><option value="changed">有变化</option><option value="unavailable">无法比较</option><option value="same">图像相同</option></select></label><input id="search" type="search" placeholder="搜索页面、语言或场景" aria-label="搜索场景"><span>点击图片可按原始像素查看，或切换三种图像。</span></div><main>${cards.join("")}<p id="empty" class="empty" hidden>没有匹配的场景。</p></main>
<dialog id="viewer"><div class="viewer-toolbar"><strong id="viewer-title"></strong><select id="image-mode" aria-label="图像"><option value="0">基线 / SSG</option><option value="1">候选 / 交互就绪</option><option value="2">红色像素差异</option></select><button id="zoom" class="control">适应窗口</button><button id="close" class="control">关闭</button></div><div class="viewer-images"><img id="viewer-image" class="viewer-image" alt="放大的图像"><p id="viewer-missing" hidden>该图像未生成。</p></div></dialog>
<script>
const filter=document.getElementById('filter'),search=document.getElementById('search'),cards=Array.from(document.querySelectorAll('.case'));
function update(){let count=0;for(const card of cards){card.hidden=(filter.value!=='all'&&card.dataset.kind!==filter.value)||!card.dataset.search.includes(search.value.trim().toLowerCase());if(!card.hidden)count++}document.getElementById('empty').hidden=count>0}filter.addEventListener('change',update);search.addEventListener('input',update);
const viewer=document.getElementById('viewer'),mode=document.getElementById('image-mode'),picture=document.getElementById('viewer-image');let selected=null;
function show(){const button=selected?.querySelector('[data-image$="-'+mode.value+'"]');picture.hidden=!button;document.getElementById('viewer-missing').hidden=!!button;if(button)picture.src=button.querySelector('img').src}
for(const button of document.querySelectorAll('.image-button'))button.addEventListener('click',()=>{selected=button.closest('.case');document.getElementById('viewer-title').textContent=selected.querySelector('h2').textContent;mode.value=button.dataset.image.split('-')[1];picture.classList.remove('fit');document.getElementById('zoom').textContent='适应窗口';show();viewer.showModal()});mode.addEventListener('change',show);document.getElementById('close').addEventListener('click',()=>viewer.close());document.getElementById('zoom').addEventListener('click',event=>{picture.classList.toggle('fit');event.target.textContent=picture.classList.contains('fit')?'原始像素':'适应窗口'});
</script></body></html>`;
  fs.writeFileSync(filename, html);
}
