# Palette and colour

## Decide the palette first

A palette chosen after the art is finished means repainting the art. Choose
before the first pixel, and state it back to the user so they can object early.

Reasonable defaults when the user has no preference:

- "retro" / "8-bit" / no detail given → **PICO-8** (16 colours, forgiving, reads well)
- "Game Boy" / "monochrome" → **gameboy** (4 values; pure form study)
- "NES-like" → a hand-built 12–16 colour palette, 3–4 hues × 4 values
- A specific game named → import a screenshot and `palette` `extract` it

Write one with `palette` `set` (hand-built entries), or `palette` `extract`
from an image the user has.

## Size

Most sprites want **8–32 colours total**. Per material, 3–5 steps is plenty:
shadow, base, light, and optionally a deep shadow and a specular.

More colours is not more quality. It is more decisions, more inconsistency, and
a sprite that cannot be recoloured for a palette swap later.

## Ramps, not gradients

A **ramp** is an ordered run of colours for one material. Build them with
`palette` op `ramp`, which hue-shifts as it goes (see
`craft/02-shading-and-light.md`). Reuse ramps across materials wherever you can —
sharing the darkest step between skin and leather ties a sprite together and
costs nothing.

## Palette discipline

Drawing does not auto-snap colours to the palette — that discipline is on
you. Paint with `applyBatch` using colours already in the palette; repair a
pass that drifted with `palette` op `snap` (nearest-palette repaint), or
deliberately append new entries with `palette` `set` first.

When a colour you want is not in the palette, do not just paint with it —
either pick an existing entry or tell the user the palette needs a new entry
and let them decide.

## Contrast is what makes a sprite readable

Value contrast, not hue contrast, carries readability. A sprite that is all
mid-tones disappears against a background. Check by squinting — or run
`effect` `hue-saturation` on a copy and see whether the shapes survive.

Keep the darkest and lightest steps of a ramp genuinely far apart. Two colours
with ΔE under 3 are the same colour to a viewer; `palette` op `analyze` flags
those as near-duplicates.
