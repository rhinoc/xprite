---
name: xprite-zh-writing
description: Write or rewrite Chinese (zh-CN) articles, comparison pages, tutorials, help pages and site copy for Xprite. Use when drafting or editing any Simplified Chinese content under apps/growth/content, including tables, FAQs and diagram labels.
metadata:
  short-description: Chinese writing rules for Xprite content
---

# Xprite zh-CN writing

Write zh-CN first, then English as a rewrite, not a translation. Every page answers one search intent, states concrete facts, and admits Xprite's limits.

## Before writing

- Read 2–3 real Chinese tech articles to absorb native rhythm, for example antfu 中文版文章, a 少数派 review or comparison, and a 阮一峰 tutorial or weekly. Notice how they pick subjects, use connectives and group parallel items.
- Collect facts only from the product, its help pages and vendor pages. Drop anything you cannot verify instead of hedging in the text.

## Hard rules

- **No reflexive 你.** Write a subject only where the actor or topic changes, and make it the real subject: Xprite、Aseprite、这个 App、工程文件、`git clone`. A frame such as 「如果要…，可以…」「想…，就…」 carries the implied reader. Target 0–2 sentence-initial 你 per section. Never use 您.
- **Connected prose.** Link sentences with 所以、不过、也就是说、这时、…以后、如果…就…. Paragraphs flow into each other; no rows of short disconnected paragraphs.
- **Lists or tables for parallel content.** Parallel steps, options, features or caveats go in a list or table.
- **No nagging advice.** Do not write 「你先复制一份工程，不要拿唯一的原文件去试。」 State a fact once, plainly, or leave it out.
- **State facts directly; do not narrate sources.** Write 「Aseprite [官方](url)只提供 Windows、macOS 和 Ubuntu 三种平台的安装包」, not 「官方购买说明里列出的安装包是…」. Avoid 文档里写、官网说、页面显示.
- **No dev notes in articles.** 文档没写、没试过、待确认 and similar belong in the PR description, never in published copy.
- **No marketing fluff.** Banned: 赋能、助力、打造、一站式、极致、神器、轻松搞定、无缝、沉浸式、开启…之旅、值得注意的是、总而言之、综上所述、各有千秋, 「无论你是…还是…」, triple adjectives, a lofty summary closing every paragraph.
- **No translationese.** Avoid 「对…进行…」「使得」「通过…来…」, 被-passives and a 它 in every clause.
- **Diagram and flow labels are verb + object only:** 导入工程 → 修改图层和帧 → 另存为 .aseprite → 拷回电脑. Never 你 + verb. Details under a label also omit 你.
- **Don't repeat names.** Merge clauses instead of writing 「Pixaki … Pixaki … Pixaki」.

## Terminology

Use Apple's official zh-CN names (verified on apple.com.cn and support.apple.com/zh-cn):

| English | zh-CN |
| --- | --- |
| Squeeze (Apple Pencil Pro) | 轻捏 |
| Double-tap | 轻点两下（笔身） |
| Tap | 轻点 |
| Apple Pencil 2nd generation | Apple Pencil（第 2 代） |
| Files app | 「文件」App |
| Safari, Share, Add to Home Screen | Safari 浏览器、「共享」、「添加到主屏幕」 |
| Mac with Apple silicon | 搭载 Apple 芯片的 Mac |
| Apple Account | Apple 账户 |

- Xprite UI labels are written exactly as they appear in the UI, inside 「」, with → between menu levels: 「文件」→「另存为」.
- File formats always use lowercase code spans: `.aseprite`、`.ase`、`.resprite`、`.pixaki`、`.px`. "Aseprite" without a code span means the app only.
- Other formats keep one form everywhere: PNG、GIF、APNG、PSD、JPEG、WebP、精灵表（Sprite Sheet）.
- On first use, give an English term in full-width parentheses after the Chinese, then use only Chinese: 洋葱皮（Onion Skin）、瓦片地图（Tilemap）.

## Typography

- Put a half-width space between Chinese and English or numbers: 「用 Xprite 画 32 × 32 的图」, `16 px`, `10 fps`. No space before `%`.
- Use full-width punctuation in Chinese text, with no spaces around it. Use 「」 for UI labels and terms, —— for dashes.
- Headings have no final period; question headings end with a full-width ？.
- List items are either all full sentences with 。 or all phrases without it.
- Use code spans for shortcuts, file names and code: `Ctrl + Z`, `walk.gif`.

## Comparison tables

- Start each cell with a marker: ✅ supported or good, ⚠️ partial or with a caveat, ❌ not supported. Use 🆓 or 💰 in price rows.
- After the marker, write a short phrase of about 12 Chinese characters or fewer, with the same structure across a row: 「✅ iCloud 同步」「⚠️ 手动存文件」.
- Move details that don't fit into a list or prose under the table. Keep important facts and drop minor ones.
- When the source doesn't cover a cell, write —. If most of a row would be —, drop the row. Never guess a marker.
- Write facts in cells, not adjectives. Never disparage competitors. Every comparison page includes a 「{对手} 做得更好的地方」 section.

## Page shapes and length

| Type | Length | Skeleton |
| --- | --- | --- |
| Comparison | 1,200–2,000 字, 4–5 H2 | H1 → one-paragraph answer → marker table → 对手做得更好的地方 → Xprite 更合适的情况 → 导入/迁移 → FAQ (3–4) |
| Tutorial | 1,200–2,500 字, 3–6 H2 | H1 → answer (≤ 80 字) → result GIF → 准备 → numbered steps (where, what, what you see) → 出错时 → 下一步 |
| Feature page | 600–1,200 字 | H1 = keyword → value sentence + CTA → demo → 3–5 concrete-use H2 → FAQ |
| Help page | 150–400 字 | H1 = the user's question → one-sentence answer → steps → limits list |
| Resource page | Resource first, then 600–1,500 字 | Usable asset → what it is → examples → background |

- Aim for a median sentence of about 25 字 and a maximum of about 45. Paragraphs are 30–80 字, up to about 150.
- The first screen answers the question. Each page targets one keyword, which appears in the title, H1, slug, first paragraph and one H2.
- Include at least 3 internal links with keyword anchor text. FAQs are real questions whose first sentence is the answer.

## Frontmatter, images and diagrams

- zh-CN articles carry frontmatter with `published:` and `updated:` (YYYY-MM-DD). Bump `updated:` on every content change. Don't write 更新于 in the body; the body starts with `# `.
- Screenshots are real Xprite captures. Article images live next to the article in `images/` with English slug names. Alt text describes what is on screen. Capture scripts use the shared helper `scripts/base/screenshot.mjs`, and generated output goes in `.tmp/`.
- Diagrams use the `article-diagram` code block, with verb + object labels.

## Self-review before handing off

1. Count sentence-initial 你 per section (target 0–2).
2. Search for 你先、不要、文档、官网、页面、没写、没试, the banned words, 挤压/双击 (use 轻捏/轻点两下), ASEPRITE and 动态 PNG.
3. Check that every table marker and number is backed by the source.
4. Check spacing between Chinese and English or numbers, and full-width punctuation.
5. Confirm the length is within the page-type range and the frontmatter dates are correct.
