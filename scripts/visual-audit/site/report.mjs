import fs from "node:fs";
import path from "node:path";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
export function writeSiteReview(directory, manifest) {
  const items = manifest.cases
    .map(
      (entry) =>
        `<figure><a href="${escape(entry.file)}"><img src="${escape(entry.file)}" loading="lazy" alt="${escape(entry.id)}"></a><figcaption>${escape(entry.id)}</figcaption></figure>`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(directory, "review.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Growth / Tools 截图审阅</title><style>body{font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{max-width:100%;height:auto;border:1px solid #aaa}figcaption{overflow-wrap:anywhere;font-size:13px}input{width:min(100%,600px);padding:8px}</style><h1>Growth / Tools 截图审阅</h1><p>${manifest.cases.length} 个原生截图；采集${manifest.captureComplete ? "完整" : "尚未完成"}。点击缩略图打开原始 PNG。</p><input aria-label="筛选场景" placeholder="筛选场景"><main>${items}</main><script>document.querySelector('input').addEventListener('input',event=>{for(const figure of document.querySelectorAll('figure'))figure.hidden=!figure.textContent.toLowerCase().includes(event.target.value.toLowerCase())})</script></html>`,
  );
}
