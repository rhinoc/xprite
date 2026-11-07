# Adapter: how these rules map to `window.xpriteAgent`

These files come from a tool built on a different editor. Their craft is the
same; only the tool names differ. Translate like this when a file names an
operation:

| These rules say | You call |
|---|---|
| `look` op `preview` | `render` |
| `look` op `ascii` | `readPixels` `format:"grid"` |
| `look` op `filmstrip` | `render` `filmstrip` |
| `look` ops `diff` / `onion` / `compare` | `readPixels` `mode:"diff"` / `render` `onionSkin` / `render` |
| `sprite_info`, `preflight` | `getContext` |
| `draw` ops `grid` / `pixels` / `fill` / `rect` / `line` / `ellipse` / `blit` / `clear` / `text` / `gradient` / `dither` / `replace` | `applyBatch` ops; `polyline` → `stroke`, `rect` → `rectangle` |
| `palette` op `ramp` / `analyze` / `extract` / `set` / `get` | `palette` same ops |
| `palette` ops `load` / `preset` / `sample_palette` | `palette` `set` / `extract` / `analyze` |
| `preflight` checks | `validate` |
| `transform` ops `flip` / `rotate` / `scale` / `translate` / `outline` | `flip` / `rotate90` / `resizeSprite` `nearest` / `translate` / `outline` ops |
| `recolor` ops `replace` / `shade` / `hue_shift` / `desaturate` | `replaceColor` / `adjustHsl` ops |
| `recolor` op `snap`, `paletteLock`, `clampToPalette` | `palette` op `snap` (nearest-palette repaint, one undo) |
| `palette` `analyze` then `effect` `hue-saturation` / `desaturate` | `effect` `hue-saturation` |
| `frame` ops `add` / `duplicate` / `set_duration` | `addFrame` / `copyFrame` / `setFrameDuration` `durations` |
| `cel` ops `move` / `set` / `copy` / `oscillate` | `setCel` `position` / `setCel` / `copyFrame` / `tweenCels` `ease:"pingpong"` |
| `tag` ops | `addTag` / `updateTag` / `removeTag` ops |
| `layer` ops `create` / `set` / `duplicate` | `addLayer` / `setLayer` / `setLayerVisibility` ops |
| `undo`/`redo`/`sprite_manage` `save` | `undo` / `redo` / `manageDocument` `save` |
| `sprite_manage` op `new` / `save_as` | `createDocument` / `manageDocument` `saveAs` |
| `reference` op | `importImage` `pixelate` for a photo→pixel-art base |
| `export` op | `exportDocument` |
| `tween` op | `tweenCels` |
| `tileset` / `pack` | `convertToTilemap` (deduplicates an image layer into a tileset) |
| `stamp` | `stampTiles` `cells` |
| draw on a tilemap / grow the atlas | `paintTiles` `rect`+`rgba` |
| `allowLossy` | `resizeSprite` `bilinear`/`rotsprite` — otherwise `nearest` only |
| `rules://` / `craft/index.md` | ignore — navigation links to other docs |

Each rule lives in a band directory — `craft/00-core/00-core-principles.md` style. Prose links inside the rules point at those paths; this file and `README.md` stay at the root next to `LICENSE`.
