---
published: 2026-10-29
updated: 2026-10-29
---

# Wplace パレット変換：画像 → マップの色

Wplace map は独自の塗色しか受け付けません。写真やロゴは、すべてのピクセルをその色セットに合わせるまでガイドとして使えません。画像を合わせ、PNG を書き出し、参照オーバーレイとしてアップロードし、[wplace.live](https://wplace.live/) で手塗りします。

Xprite の [画像をドット絵に](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) は、組み込みの **Wplace map** パレットでブラウザ内で色合わせします。ファイルは端末に残ります。アップロードはありません。Xprite は Wplace / wplace.live と**提携・後援・パートナー関係はありません**。このページは非公式ガイドです。

- パレット選択済みのディープリンク：[Pixelate の Wplace map パレット](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette)。
- オーバーレイアップロード：wplace.live 公式の [Overlays ガイド](https://wplace.live/guides/overlays)。
- 書き出し後：**手塗り**。Xprite は自動塗装せず、`.wplace` も書き出しません。

## ここでの「Wplace パレット変換」の意味

Xprite Pixelate で画像を開き、端末上でピクセルを **Wplace map** の色に合わせ、**参照オーバーレイ**として使える PNG をダウンロードすることです。

次にはあたりません：

- マップを代わりに塗るボットや userscript
- 自動塗装や「Studio / alliance」系のパイプライン
- 公式 Wplace 製品・提携ツール、または `.wplace` エクスポート
- wplace.live が同じ色をずっと保つという約束

PNG は位置合わせと手塗り用です。公式テンプレート工程ではありません。

## 画像を Wplace map の色へ変換する

1. [Wplace map パレット付きの画像をドット絵に](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) を開く。インストール不要。PNG、JPEG、WebP。
2. **画像を変換**を選び、ファイルをドロップまたは開く。処理は端末内。
3. パレットが **Wplace map** であることを確認（ディープリンクで選択済み）。必要ならサイズなど変換設定を変える。
4. プレビューしてから PNG を**書き出し**。
5. wplace.live で公式 [Overlays ガイド](https://wplace.live/guides/overlays) に従いその PNG をオーバーレイとしてアップロードし、位置を合わせてマップを**手塗り**する。

任意：**続けて編集**は結果を [Xprite エディター](/?utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) で開き、整えてから再度書き出せます。

## 色と十六進数（プリセットを開く）

**Wplace map** プリセットは塗色 **63 色**（ライブピッカーの Transparent は除く）。出典はリポジトリ：`LICENSES/wplace-map-palette.txt`、`ATTRIBUTION.md`、および `packages/palette-assets/wplace/wplace-map.gpl`（非公式キャプチャ、2026-10-25。ソース URL と方法は上記ファイル）。

wplace.live がクライアントを更新すると色は**ずれる可能性**があります。ここに全十六進表を再掲するより、ツールを開いて現在のプリセットを読んでください。公式のパレットダンプではありません。

## 正直な限界

- 非公式・無関係：Xprite は Wplace / wplace.live の後援・パートナーではありません。このページに Wplace ロゴや「公式 / powered by」はありません。
- 書き出すのは自分でアップロードする **PNG 参照オーバーレイ**です。全タイル一致や色リストの永続を保証しません。
- 自動塗装なし、`.wplace` 書き出しなし、マップ塗装用 userscript も Xprite にはありません。
- オーバーレイと手塗りのルールは wplace.live 側です。[Overlays ガイド](https://wplace.live/guides/overlays) に従ってください。

## よくある質問

### Wplace パレット変換とは何ですか？

画像を **Wplace map** の塗色に合わせ、参照オーバーレイ用 PNG を書き出す方法です。Xprite では **Wplace map** プリセット付き Pixelate：端末内変換であり、マップボットではありません。

### 公式ですか？wplace.live と提携していますか？

いいえ。Xprite は Wplace / wplace.live と提携・後援・パートナー関係はありません。このガイドとパレットプリセットは非公式です。

### 画像を Xprite にアップロードしますか？

しません。Pixelate はブラウザで動きます。画像は Xprite サーバーへ行きません。

### 画像を Wplace map の色に変換するには？

[`?palette=wplace` の Pixelate](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) を開き、画像を変換し、**Wplace map** を確認してプレビューし、PNG を書き出します。その後公式 [Overlays](https://wplace.live/guides/overlays) の流れに従い、手塗りします。

### PNG は wplace.live のどこで使いますか？

**参照オーバーレイ**としてアップロードし、位置を合わせて手塗りします。[wplace.live/guides/overlays](https://wplace.live/guides/overlays) を参照。

### Xprite は自動塗装や `.wplace` 書き出しができますか？

できません。Xprite は PNG 参照を書き出すだけです。マップの自動塗装も `.wplace` 書き出しもありません。

---

[Wplace map パレット変換を開く](/tools/pixelate/?palette=wplace&utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) · [Overlays ガイド（wplace.live）](https://wplace.live/guides/overlays) · [画像をドット絵に](/tools/pixelate/?utm_source=compare&utm_medium=referral&utm_campaign=wplace-palette) · [Xprite とは](/about/)
