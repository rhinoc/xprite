---
published: 2026-10-10
updated: 2026-10-30
---

# Xprite vs Piskel：Aseprite ファイルを開ける無料の Piskel 代替

Xprite は無料・オープンソースのブラウザ向けピクセルアートエディターで、Piskel と違い `.aseprite` を開いて保存でき、スマホやタブレットでも使えます。短いアニメをデスクトップのブラウザで描くなら、Piskel の方がまだ簡単です。両者のうち `.piskel` を開けるのも Piskel だけです。

- `.aseprite` を編集したい、ペンや指で描きたい、フレームごとに違う尺を付けたい：Xprite。
- パソコンで短いループを作り、メニューは少ないほどよい：Piskel のまま。
- たくさんの `.piskel` プロジェクトを別ツールで続けたい：`.piskel` を直接開ける Pixelorama。

[ブラウザで Xprite を開く](/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives)。インストールもアカウントも不要です。

## Xprite vs Piskel 一覧

|               | Piskel                                                                    | Xprite                                                        |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 価格          | 🆓 無料、広告あり。Piskel for Kids は広告なし                             | 🆓 無料、アカウント不要                                       |
| ソースコード  | ✅ オープンソース、Apache-2.0                                             | ✅ オープンソース、GPL-2.0-only                               |
| デバイス      | ⚠️ デスクトップブラウザ。スマホ・タブレット非対応                         | ✅ パソコン・タブレット・スマホのブラウザ                     |
| ペンとタッチ  | ❌ なし                                                                   | ✅ ペンで描画、指でパン・ズーム・取り消し                     |
| `.piskel`     | ✅ ネイティブ形式                                                         | ❌ 先に GIF か PNG スプライトシートを書き出す                 |
| `.aseprite`   | ❌ なし                                                                   | ✅ 開いて保存                                                 |
| レイヤー      | ✅ あり                                                                   | ✅ あり（RGB・グレースケール・インデックスカラーも）          |
| オニオンスキン| ✅ あり                                                                   | ✅ あり                                                       |
| フレーム尺    | ⚠️ アニメ全体で 1 つの FPS                                                | ✅ フレームごとの尺、タグでアニメ分割                         |
| 書き出し      | ✅ GIF、PNG シート、単体 PNG、フレーム ZIP、PixiJS JSON、C 配列           | ✅ PNG、GIF、APNG、WebP、JSON 付き PNG シート、タイルセット   |
| オフライン    | ⚠️ Windows / macOS / Linux アプリ（テストは限定的）                       | ⚠️ デスクトップやホーム画面に追加；先に一度オンラインで開く   |
| 保存先        | `.piskel` ファイル、またはこのブラウザ                                    | `.aseprite` / `.png` ファイル、またはこのブラウザ             |

## Piskel の方がよいところ

- **`.piskel` プロジェクトを開ける。** Xprite は読めません。
- **覚えることが少ない。** ツールが少なく、描きながら速度を変えられるライブプレビューがあります。歩きサイクルやアイコンアニメなら、それで十分なことが多いです。
- **Piskel for Kids。** [子ども向け版](https://www.piskelapp.com/faq)は広告・個人情報の追跡・ソーシャル機能がなく、教室向きです。Xprite は匿名の利用統計（作品は含まない）を送ります。[プライバシー](/privacy/)を参照。
- **ダウンロードできるデスクトップアプリ。** Piskel は Windows / macOS / Linux 向けの[オフラインアプリ](https://www.piskelapp.com/download)を出しています。テストは「非常に限定的」でリリース予定もなく、Web 版を推奨しています。
- **書き出し先が少し多い**：PixiJS 用 JSON 付きシート、フレームを配列にした C ファイル、レイヤー分割できるフレーム ZIP。

## Xprite の方がよいところ

- **Aseprite ファイル。** `.ase` / `.aseprite` を読み書きし、レイヤー・フレーム・タグを保ちます。Aseprite 利用者にファイルを返せます。完全互換でないプロジェクトもあり、Aseprite のスクリプトや拡張は動きません。
- **スマホとタブレット。** Piskel の [README](https://github.com/piskelapp/piskel#mobiletablets) はモバイル非対応と明記しています。Xprite ではペンを使うとペンが描き、指がパンします。ピンチでズーム、2 本指タップで取り消し、3 本でやり直し。[指とペン](/help/#fingers-and-a-pen)を参照。
- **尺と構造。** フレームごとに尺を付けられ、タグで 1 ファイルを複数アニメに分けられます。ゲーム向けにタイルマップレイヤーとインデックスカラーもあります。
- **書き出し形式が多い。** アニメ GIF / APNG / WebP、任意で JSON 付きの PNG スプライトシート。

乗り換え前に：Xprite は一人で開発中で、まだ改善途上のため一部機能に不具合があることがあります。**ブラウザ**に保存したプロジェクトはその端末のそのブラウザにしか残らないので、残したいものは **ファイルマネージャー** に保存してください。

## どちらを選ぶか

- **初心者・子ども・パソコンで手早く GIF**：Piskel。教室なら Piskel for Kids。
- **Aseprite 利用者とファイルをやりとりする人**：Xprite。
- **iPad やスマホで描く**：Xprite。Piskel はモバイル非対応。
- **フレームごとの尺・タグ・JSON 付きシートが要るゲームスプライト**：Xprite。
- **古い `.piskel` を Piskel 以外で編集し続けたい**：Pixelorama。

## ほかの Piskel 代替

- [Pixelorama](https://pixelorama.org/user_manual/Import)：無料・オープンソース。デスクトップアプリと Web 版あり。`.piskel`、`.aseprite`、PSD、Krita を取り込めるので、古い Piskel プロジェクトの移行にいちばん直球です。プロジェクトは `.pxo`。
- [Pixilart](https://www.pixilart.com/features)：エディターとアートコミュニティが一体。Web とモバイルアプリ。フレームごとの尺とオニオンスキンあり。有料 PRO で広告なし、`.pixil` を同期。

## Piskel の作業を Xprite へ移す

1. **原本を残す**：Piskel から `.piskel` をダウンロードしてバックアップ。
2. **アニメを書き出す**：GIF、またはフレーム切りを自分で決めたいなら PNG スプライトシート。
3. **GIF を開く**：Xprite で **ファイル → 開く…**。GIF の各フレームがフレームになります。
4. **スプライトシートの場合**：**ファイル → スプライトシートを読み込む** でフレーム境界を設定。シートには尺が無いので、あとでタイムラインで付け直します。

GIF とスプライトシートは合成後の画素だけなので、レイヤーは失われます。レイヤーを残すなら Piskel の ZIP 書き出しで **Split by layers** を使い、Xprite でレイヤーを組み直します。GIF は 256 色までなので、色が大事なら PNG シートを使ってください。

ゲームエンジン用にフレームだけ必要なら、[GIF からスプライトシート](/tools/gif-to-sprite-sheet/)で GIF を PNG シート＋JSON（座標と尺）にできます。エディターを開かずに済みます。やわらかい／グリッドずれの AI「ドット絵」は、先に [AI ドット絵を修正](/tools/fix-ai-pixel-art/)（Recover Grid）で直してからブラウザの無料エディターで続けられます。

## よくある質問

### いちばんよい無料の Piskel 代替は？

目的次第です。`.aseprite` を開きたい、スマホやタブレットで描きたいなら Xprite。`.piskel` を開きたいなら Pixelorama。どちらも無料・オープンソースです。

### Xprite は `.piskel` を開ける？

いいえ。Piskel から GIF か PNG スプライトシートを書き出して、それを Xprite で開いてください。

### Piskel は `.aseprite` を開ける？

いいえ。Piskel が取り込めるのは `.piskel` と PNG / JPG / BMP / アニメ GIF です。

### Piskel は iPad やスマホで使える？

README にモバイル非対応とあります。Xprite はスマホ・タブレットのブラウザで動き、ペンとタッチジェスチャーに対応しています。

### Piskel はまだメンテされている？

GitHub リポジトリは 2026 年 10 月にもコミットがありました。GitHub の最新リリースは 2018 年 11 月の v0.15.0 で、デスクトップアプリはベストエフォートの更新だけです。

---

[Xprite を開いて](/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives) Piskel の GIF を読み込んでみてください。先に `.aseprite` を確認したいときは [Aseprite ビューアー](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives)へ。Xprite については [Xprite とは](/about/)、または [オンラインの Aseprite エディター比較](/compare/aseprite-online/)もどうぞ。
