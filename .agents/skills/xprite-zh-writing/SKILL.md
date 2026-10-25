---
name: xprite-zh-writing
description: Write Simplified Chinese for Xprite — blog long-form, SEO articles, and in-app / i18n copy.
metadata:
  short-description: zh-CN writing — thin entry, scenario refs, format + soft scan
---

# Xprite zh-CN writing

## 怎么用

1. 读完下面的通则。
2. 按任务再读一份场景参考：`references/seo-article.md`、`references/blog-longform.md` 或 `references/app-copy.md`。动笔前可翻 `references/exemplars.md`。
3. 写作成品。
4. 跑格式脚本（硬修正空格与标点）：

```sh
python3 .agents/skills/xprite-zh-writing/scripts/format.py path/to/draft.md --fix-in-place
```

5. 再跑软扫描（只打印 WARN，默认不失败；命中要结合上下文判断，有的可以保留）：

```sh
python3 .agents/skills/xprite-zh-writing/scripts/scan.py path/to/draft.md
```

词表在 `scripts/phrases.txt`，改列表即可，不用动脚本逻辑。

## 通则

说人话，直白，主谓宾齐全。像真人技术作者在讲自己做过的事。

- **主语：** 段落首句、换话题、动作主体变了时写出主语。读者做事用「你」，一起做用「我们」，产品用「Xprite」或功能名。同一主语可承前省；编号步骤可用祈使，仍写清在哪、做什么、得到什么。
- **衔接：** 用先……然后……、……以后、这时、如果……就……、因为……所以……、不过 等把句子串起来。
- **长度：** 句长中位约 25 字，单句约 ≤45 字则拆句；段长约 30–80 字，上限约 150。
- **人称：** 读者称「你」；作者自称「我」（个人长文）或「我们」（产品文），一篇一种。
- **修辞：** 用平铺事实与因果。比喻、排比、「A 而是 B」一类对照转折，改成直接说明。
- **用词：** 尽量用同义复合词（双音节、意思落地），例如「明白 / 理解 / 遇到 / 发现 / 处理 / 说明」。不要把英文习惯硬译进中文：英式「I catch you / bump into a bug」会变成「接住你了 / 撞上一个问题」——中文里没人这么说，应写成「我明白你的意思」「我们遇到一个问题」。
- **成品：** 正文只留读者向叙述；过程笔记放临时文件；讨论与批注放评论，不进正文。中稿以写作者身份出场。
- **核对：** 动笔前用真实来源核对每一句（产品、实测、官方材料）。正文只写事实本身；不写「哪个文件哪一行」「证据：」「来源：README」这类核对痕迹。截图来自真实操作，数字可复现，占位示例发布前改成实测。
- **图示：** 流程图节点标签写成「动词 + 宾语」。并列步骤、选项用列表或表格。生图细则见场景参考（长文见 `references/blog-longform.md`）。
- **动笔前：** 读 `references/exemplars.md` 里的链接与短摘（antfu、阮一峰），对齐节奏；也可再读 1 篇少数派对比/评测。

机械空格与标点由 `scripts/format.py` 硬修；负面框架 / 过程词泄漏由 `scripts/scan.py` 软提示。通则里写判断，脚本里跑检查。
