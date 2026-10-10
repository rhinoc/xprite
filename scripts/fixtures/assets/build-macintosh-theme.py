"""Generate independent Macintosh atlases from attributed icon silhouettes and metrics.

Requires Pillow. Frames are original Xprite drawings; derived icon artwork is
CC BY 4.0, David Capello and Ilija Melentijevic (2009–2017).
"""

import hashlib
import json
import re
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "packages/ui/assets/themes/aseprite"
OUTPUT = ROOT / "packages/ui/assets/themes/macintosh"
MODULES = ROOT / "packages/ui/src/base/theme/themes/macintosh"
CELL_SIZE = 40
COLUMNS = 16
ICON_LUMINANCE_THRESHOLD = 150000
RED_WEIGHT = 299
GREEN_WEIGHT = 587
BLUE_WEIGHT = 114
SELECTED_PART_MARKERS = ("selected", "pushed", "clicked", "active", "full")
WASH_PART_MARKERS = ("scrollbar_bg", "editor", "normal")
ROUNDED_BUTTON_PREFIXES = ("button_", "buttonset_item")
SCROLLBAR_PREFIXES = ("scrollbar_", "mini_scrollbar_", "transparent_scrollbar_")
CONTROL_ICON_PREFIXES = ("check_", "radio_")
TAB_FACE_HEIGHT = 16
TAB_BOTTOM_HEIGHT = 3
WINDOW_STRIPE_COUNT = 5
WINDOW_STRIPE_STEP = 2
WINDOW_CLOSE_SIZE = 6
TAB_PARTS = ("tab_normal", "tab_active", "tab_bottom_normal", "tab_bottom_active",
             "tab_filler", "tab_icon_bg_hover", "tab_icon_bg_clicked")
TAB_GLYPH_PREFIXES = ("tab_close_icon_", "tab_modified_icon_", "tab_home_icon_")


def joined_button(name, width, height, palette):
    """System 7 pop-up field: a single rectangular outline, without an arrow divider."""
    ink, paper, wash = (palette[role] for role in ("ink", "paper", "wash"))
    face = ink if name.endswith("selected") else wash if name.endswith("hot") else paper
    sprite = Image.new("RGBA", (width, height), face)
    draw = ImageDraw.Draw(sprite)
    draw.line((0, 0, width - 1, 0), fill=ink)
    draw.line((0, height - 1, width - 1, height - 1), fill=ink)
    edge = 0 if "_left_" in name else width - 1
    draw.line((edge, 0, edge, height - 1), fill=ink)
    if name.endswith("focused"):
        draw.line((0, height - 2, width - 1, height - 2), fill=ink)
    return sprite


def combobox_arrow(name, width, height, palette):
    """Compact monochrome arrows retain the existing icon box and alignment."""
    sprite = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(sprite)
    if "_down" in name:
        points = [(2, 3), (6, 3), (4, 5)]
    elif "_up" in name:
        points = [(2, 5), (6, 5), (4, 3)]
    elif "_left" in name:
        points = [(5, 2), (5, 6), (3, 4)]
    else:
        points = [(3, 2), (3, 6), (5, 4)]
    draw.polygon(points, fill=palette["ink"])
    return sprite


def tab_glyph(name, width, height, palette):
    """All tab glyph states use the same ink, including the unsaved marker."""
    sprite = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(sprite)
    ink = palette["ink"]
    if name.startswith("tab_close_icon_"):
        draw.line((0, 0, width - 1, height - 1), fill=ink)
        draw.line((width - 1, 0, 0, height - 1), fill=ink)
    elif name.startswith("tab_modified_icon_"):
        draw.ellipse((0, 0, width - 1, height - 1), fill=ink)
    else:
        draw.polygon([(0, 3), (width // 2, 0), (width - 1, 3)], fill=ink)
        draw.rectangle((1, 3, width - 2, height - 1), fill=ink)
        draw.rectangle((width // 2, 5, width // 2, height - 1), fill=(0, 0, 0, 0))
    return sprite


def tab_sprite(name, width, height, palette):
    """Paper folder tabs join the content plane instead of inverting a button."""
    ink, paper, wash = (palette[role] for role in ("ink", "paper", "wash"))
    sprite = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(sprite)
    if name in ("tab_normal", "tab_active"):
        top = 0
        face = paper if name == "tab_active" else wash
        outline = [(0, height - 1), (0, top + 2), (2, top),
                   (width - 3, top), (width - 1, top + 2), (width - 1, height - 1)]
        draw.polygon(outline, fill=face)
        draw.line(outline, fill=ink)
    elif name.startswith("tab_bottom_"):
        draw.rectangle((0, 0, width - 1, height - 1), fill=paper)
        if name == "tab_bottom_normal":
            draw.line((0, 0, width - 1, 0), fill=ink)
        else:
            draw.point((0, 0), fill=ink)
            draw.point((width - 1, 0), fill=ink)
    elif name == "tab_filler":
        draw.rectangle((0, 0, width - 1, height - 1), fill=wash)
    else:
        face = paper if name.endswith("clicked") else wash
        draw.rectangle((2, 4, 8, 10), fill=face, outline=ink)
    return sprite


def window_button(name, width, height, palette):
    """An unembellished close box; reveal the cross on hover and invert on press."""
    sprite = Image.new("RGBA", (width, height), palette["paper"])
    # State-specific cross contours are rendered in the same native vector
    # coordinates as the close-box outline, rather than at atlas scale 2.
    return sprite


def control_icon(name, width, height, palette):
    """Draw controls separately from document/tool icons, with legible state pairs."""
    sprite = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(sprite)
    ink = palette["muted"] if name.endswith("disabled") else palette["ink"]
    paper = palette["paper"]
    if name.startswith("check_"):
        draw.rectangle((0, 0, width - 1, height - 1), fill=paper, outline=ink)
        if name.endswith("selected"):
            draw.line([(1, height // 2), (width // 2 - 1, height - 2), (width - 2, 1)], fill=ink)
    elif name.startswith("radio_"):
        draw.ellipse((0, 0, width - 1, height - 1), fill=paper, outline=ink)
        if name.endswith("selected"):
            draw.ellipse((2, 2, width - 3, height - 3), fill=ink)
    elif name.startswith("mini_slider_thumb"):
        face = palette["wash"] if name.endswith("focused") else paper
        draw.rectangle((0, 0, width - 1, height - 1), fill=face, outline=ink)
    return sprite


def generate():
    manifest = json.loads((SOURCE / "aseprite-light-theme.json").read_text())
    palettes = json.loads((OUTPUT / "palette.json").read_text())
    original = Image.open(SOURCE / "aseprite-theme-sheet.webp").convert("RGBA")
    rows = math.ceil(len(manifest["parts"]) / COLUMNS)
    parts = {}
    for index, (name, part) in enumerate(manifest["parts"].items()):
        if max(part["width"], part["height"]) > CELL_SIZE:
            raise ValueError(f"Control part exceeds atlas cell: {name}")
        parts[name] = {**part, "x": index % COLUMNS * CELL_SIZE,
                       "y": index // COLUMNS * CELL_SIZE}
        if name.startswith(SCROLLBAR_PREFIXES) or name == "tab_bottom_normal":
            width, height = part["width"], part["height"]
            slices = [1, width - 2, 1, 1, height - 2, 1]
            parts[name]["slices"] = slices
            for key, value in zip(("w1", "w2", "w3", "h1", "h2", "h3"), slices):
                parts[name][key] = value
        if name.startswith(("check_", "radio_")):
            parts[name].update(width=6, height=6, w=6, h=6)
        if name.startswith("tab_icon_bg_"):
            parts[name]["height"] = TAB_FACE_HEIGHT
            parts[name]["h"] = TAB_FACE_HEIGHT
        if name == "window_close_icon":
            parts[name].update(width=5, height=5, w=5, h=5)
        if name.startswith("window_button_"):
            parts[name].update(width=WINDOW_CLOSE_SIZE, height=WINDOW_CLOSE_SIZE, w=WINDOW_CLOSE_SIZE, h=WINDOW_CLOSE_SIZE)

    for name, part in parts.items():
        surface = None
        if name.startswith("sunken") or name == "menu":
            surface = {"faceRole": "textbox_face", "borderRole": "text", "borderWidth": 1}
            if name == "menu":
                surface["shadow"] = 1
        elif name.startswith("drop_down_button_"):
            selected = name.endswith("selected")
            surface = {"faceRole": "selected" if selected else "face" if name.endswith("hot") else "background",
                       "borderRole": "text", "borderWidth": 1,
                       "borderSides": [True, "_right_" in name, True, "_left_" in name]}
        elif name == "window":
            surface = {"faceRole": "window_face", "borderRole": "text", "borderWidth": 1,
                       "shadow": 1, "titlebar": {"height": 19, "stripeCount": 6, "stripeStep": 2, "inset": 1}}
            part["slices"][3] = 9
            part["h1"] = 9
        elif name.startswith(("toolbutton_", "buttonset_item_")):
            surface = {"faceRole": "selected" if name.startswith("buttonset_item_") and "pushed" in name else "face" if any(state in name for state in ("hot", "active", "pushed")) else "background",
                       "borderRole": "text", "borderWidth": 1}
        elif name.startswith(("check_", "radio_")):
            surface = {"faceRole": "background", "borderRole": "disabled" if name.endswith("disabled") else "text", "borderWidth": 1, "focusedBorderWidth": 2}
            if name.startswith("radio_"):
                surface["pixelCircle"] = True
            if name.endswith("selected"):
                surface["mark"] = "radio" if name.startswith("radio_") else "check"
        elif name in ("tab_normal", "tab_active"):
            surface = {"faceRole": "background" if name == "tab_active" else "face", "borderRole": "text", "borderWidth": 1,
                       "borderSides": [True, True, False, True], "radius": [3, 3, 0, 0]}
        elif name in ("tab_bottom_normal", "tab_bottom_active", "tab_filler"):
            surface = {"faceRole": "face" if name == "tab_filler" else "background", "borderRole": "text", "borderWidth": 1,
                       "borderSides": [name == "tab_bottom_normal", name == "tab_bottom_active", False, name == "tab_bottom_active"]}
        elif name.startswith("colorbar_"):
            surface = {"borderRole": "disabled" if "selection" in name else "text", "borderWidth": 1}
        elif name == "window_close_icon":
            outline = "M1 1H12V12H1Z M2 2V11H11V2Z"
            cross = " ".join(f"M{3+i} {3+i}h1v1h-1Z M{9-i} {3+i}h1v1h-1Z" for i in range(7))
            part.update(width=6, height=6, w=6, h=6, vector={"width": 12, "height": 12,
                        "path": outline, "hoverPath": outline + " " + cross,
                        "pressedPath": cross,
                        "pressedFace": {"path": "M1 1H12V12H1Z", "colorRole": "selected"}})
            surface = {"borderRole": "text", "borderWidth": 1}
        if name in ("separator_horz", "separator_vert"):
            horizontal = name == "separator_horz"
            part.update(foregroundRole="palette_entries_separator", vector={"width": 18 if horizontal else 1,
                        "height": 1 if horizontal else 18, "path": "M0 0H18V1H0Z" if horizontal else "M0 0H1V18H0Z"})
        if surface:
            part["surface"] = surface

    for name, part in parts.items():
        if name.startswith("combobox_arrow_"):
            direction = name.split("_")[2]
            down = "M11 0H0V1H1V2H2V3H3V4H4V5H5V6H6V5H7V4H8V3H9V2H10V1H11Z"
            vector = {"width": 12, "height": 6, "path": down}
            if direction == "up":
                vector["path"] = "M5 0H6V1H7V2H8V3H9V4H10V5H11V6H0V5H1V4H2V3H3V2H4V1H5Z"
            elif direction in ("left", "right"):
                vector = {"width": 6, "height": 12, "path": "M0 0H1V1H2V2H3V3H4V4H5V5H6V6H5V7H4V8H3V9H2V10H1V11H0Z" if direction == "right" else "M6 0H5V1H4V2H3V3H2V4H1V5H0V6H1V7H2V8H3V9H4V10H5V11H6Z"}
            part.update(width=vector["width"] // 2, height=vector["height"] // 2, w=vector["width"] // 2, h=vector["height"] // 2, vector=vector,
                        foregroundRole="disabled" if name.endswith("disabled") else "button_selected_text" if name.endswith("selected") else "text")

    hashes = {}
    for appearance, palette in palettes.items():
        ink, paper, wash = (palette[role] for role in ("ink", "paper", "wash"))
        atlas = Image.new("RGBA", (CELL_SIZE * COLUMNS, CELL_SIZE * rows))
        for name, part in parts.items():
            old = manifest["parts"][name]
            width, height = part["width"], part["height"]
            if name in TAB_PARTS:
                sprite = tab_sprite(name, width, height, palette)
            elif name in ("colorbar_0", "colorbar_1", "colorbar_2", "colorbar_3", "colorbar_selection", "colorbar_selection_hot"):
                # These borders overlay real swatch pixels; they must not paint
                # an opaque paper frame over the color or change size on hover.
                sprite = Image.new("RGBA", (width, height))
                line = palette["muted"] if name.startswith("colorbar_selection") else ink
                ImageDraw.Draw(sprite).rectangle((0, 0, width - 1, height - 1), outline=line)
            elif name.startswith("drop_down_button_"):
                sprite = joined_button(name, width, height, palette)
            elif name.startswith("combobox_arrow_"):
                sprite = combobox_arrow(name, width, height, palette)
            elif name.startswith(TAB_GLYPH_PREFIXES):
                sprite = tab_glyph(name, width, height, palette)
            elif name.startswith("window_button_"):
                sprite = window_button(name, width, height, palette)
            elif name == "window_close_icon":
                # The state background supplies the cross; the ink-only outline
                # follows the button's foreground, including its pressed inversion.
                sprite = Image.new("RGBA", (width, height))
                ImageDraw.Draw(sprite).rectangle((0, 0, width - 1, height - 1), outline=ink)
            elif old["slices"] is None and (name.startswith(CONTROL_ICON_PREFIXES) or
                name.startswith("mini_slider_thumb")):
                sprite = control_icon(name, width, height, palette)
            elif old["slices"] is None:
                sprite = original.crop((old["x"], old["y"], old["x"] + width,
                                        old["y"] + height))
                pixels = sprite.load()
                for y in range(height):
                    for x in range(width):
                        red, green, blue, alpha = pixels[x, y]
                        luminance = red * RED_WEIGHT + green * GREEN_WEIGHT + blue * BLUE_WEIGHT
                        color = ink if luminance < ICON_LUMINANCE_THRESHOLD else paper
                        pixels[x, y] = (*bytes.fromhex(color[1:]), alpha)
            else:
                selected = any(marker in name for marker in SELECTED_PART_MARKERS)
                # Tool labels/icons and active button-set labels retain normal ink.
                if name.startswith("toolbutton_") or name == "buttonset_item_active":
                    selected = False
                fill = ink if selected else paper
                is_button = "button" in name
                if not selected and ("hot" in name or name == "buttonset_item_active" or
                    name == "toolbutton_pushed" or
                    (not is_button and any(marker in name for marker in WASH_PART_MARKERS))):
                    fill = wash
                if name.startswith("sunken"):
                    fill = paper
                sprite = Image.new("RGBA", (width, height), fill)
                draw = ImageDraw.Draw(sprite)
                if name.startswith(ROUNDED_BUTTON_PREFIXES):
                    sprite = Image.new("RGBA", (width, height))
                    draw = ImageDraw.Draw(sprite)
                    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=2, fill=fill, outline=ink)
                    if "focused" in name:
                        draw.rounded_rectangle((2, 2, width - 3, height - 3), radius=1, outline=ink)
                else:
                    draw.rectangle((0, 0, width - 1, height - 1), outline=ink)
                if name == "toolbutton_pushed":
                    draw.line((1, 1, width - 2, 1), fill=ink)
                    draw.line((1, 1, 1, height - 2), fill=ink)
                if name == "window":
                    separator_y = old["slices"][3] - 1
                    stripe_span = (WINDOW_STRIPE_COUNT - 1) * WINDOW_STRIPE_STEP + 1
                    stripe_top = (separator_y - stripe_span + 1) // 2
                    for y in range(stripe_top, stripe_top + stripe_span, WINDOW_STRIPE_STEP):
                        draw.line((old["slices"][0], y, width - old["slices"][2] - 1, y), fill=ink)
                    draw.line((0, old["slices"][3] - 1, width - 1, old["slices"][3] - 1), fill=ink)
                if name.startswith(SCROLLBAR_PREFIXES):
                    face = wash if "bg" in name or "hot" in name else paper
                    sprite = Image.new("RGBA", (width, height), face)
                    draw = ImageDraw.Draw(sprite)
                    draw.rectangle((0, 0, width - 1, height - 1), outline=ink)
                    if name == "transparent_scrollbar_bg":
                        sprite = Image.new("RGBA", (width, height))
            if old["slices"] is None:
                rgba = sprite.tobytes()
                opaque = [tuple(rgba[index:index + 3]) for index in range(0, len(rgba), 4) if rgba[index + 3]]
                if opaque and all(rgb == tuple(bytes.fromhex(ink[1:])) for rgb in opaque):
                    part["foregroundRole"] = (
                        "disabled" if "disabled" in name else
                        "button_selected_text" if name.startswith("combobox_arrow_") and name.endswith("selected")
                        else "text"
                    )
            atlas.paste(sprite, (part["x"], part["y"]))
        target = OUTPUT / f"macintosh-{appearance}-sheet.webp"
        atlas.save(target, lossless=True, exact=True)
        hashes[appearance] = hashlib.sha256(target.read_bytes()).hexdigest()

    parts["separator_horz"].update(width=9, height=0.5, foregroundRole="palette_entries_separator")
    parts["separator_vert"].update(width=0.5, height=9, foregroundRole="palette_entries_separator")
    geometry = {
        "provenance": {
            "source": "Xprite Macintosh frames; Aseprite CC-BY-4.0 icon silhouettes and control metrics",
            "sha256": manifest["provenance"]["sha256"],
            "sheetSha256": hashes["light"],
        },
        "sheet": {"width": CELL_SIZE * COLUMNS, "height": CELL_SIZE * rows},
        "dimensions": {**manifest["dimensions"],
                       "scrollbar_default_size": 8,
                       "window_close_button_width": 13,
                       "window_close_button_height": 13,
                       "window_close_button_right": 2,
                       "window_close_button_top": 3,
                       "color_button_hover_height_inset": 0,
                       "tooltip_text_inset": 14,
                       "checkbox_icon_offset": 0,
                       "checkbox_label_offset": 16, "checkbox_text_offset_y": 1, "checkbox_height": 12, "input_height": 22, "combobox_height": 18, "combobox_width": 156,
                       "input_text_inset": 5,
                       "input_text_offset_y": 1,
                       "combobox_text_offset_y": 1,
                       "combobox_text_inset": 16,
                       "combobox_arrow_inset": 17,
                       "combobox_arrow_centered": 1,
                       "menu_row_height": 16,
                       "menu_frame_inset": 1,
                       "menu_item_inset": 1,
                       "menu_text_inset": 17,
                       "menu_text_state_offset_x": -1,
                       "menu_shortcut_inset": 1,
                       "menu_submenu_arrow_inset": 8,
                       "menu_shortcut_column_aligned": 1,
                       "menu_shortcut_glyph_offset_y": -1,
                       "menu_width_reserve": 9,
                       "menu_disabled_emboss": 0,
                       "menu_separator_height": 16,
                       "menu_separator_offset_y": 8,
                       "menu_minimum_width": 141,
                       "menubar_height": 20,
                       "menubar_horizontal_padding": 17,
                       "menubar_mnemonics_visible": 0,
                       "menu_mnemonics_visible": 0,
                       "window_close_button_left": 8,
                       "window_title_centered": 1,
                       "window_title_padding": 7,
                       "tabs_fit_content": 1,
                       "tabs_horizontal_padding": 32,
                       "tabs_text_inset": 16,
                       "tabs_leading_inset": 3,
                       "tabs_height": 12,
                       "docked_tabs_height": 11,
                       "tabs_bottom_height": 1,
                       "tabs_close_icon_height": 11}, "parts": parts,
    }
    # Evaluate the same pure artwork helpers used by runtime controls.
    token_script = """
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){
  if (specifier.startsWith('$/')) specifier=pathToFileURL(process.cwd()+'/packages/ui/src/'+specifier.slice(2)+(specifier.endsWith('.json') ? '' : '.ts')).href;
  return next(specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.json') ? specifier+'.ts' : specifier,context);
}});
const {moduleURL,palettes}=JSON.parse(readFileSync(0,'utf8'));
const {macintoshPublicSurfaceTokens}=await import(moduleURL);
console.log(JSON.stringify(Object.fromEntries(Object.entries(palettes).map(([mode,palette])=>[mode,macintoshPublicSurfaceTokens(palette,mode)]))));
"""
    token_result = subprocess.run(["node", "--input-type=module", "-e", token_script],
        input=json.dumps({"moduleURL": (MODULES / "public-surface-tokens.ts").as_uri(), "palettes": palettes}),
        capture_output=True, text=True, cwd=ROOT, check=True)
    public_tokens = json.loads(token_result.stdout)
    # Static public pages consume the same palette without a React runtime.
    stylesheet = []
    for appearance, palette in palettes.items():
        declarations = [f"  --ui-theme-{role}: {color};" for role, color in palette.items()]
        declarations.extend(f"  {key}: {value};" for key, value in public_tokens[appearance].items())
        stylesheet.append(
            f'[data-ui-theme="macintosh"][data-ui-appearance="{appearance}"] {{\n'
            + f"  color-scheme: {appearance};\n" + "\n".join(declarations) + "\n}"
        )
    (OUTPUT / "macintosh-site.css").write_text("\n\n".join(stylesheet) + "\n")
    geometry_path = MODULES / "geometry.ts"
    geometry_path.write_text(
        '// Generated by pnpm assets:macintosh-theme. Aseprite icons/metrics: CC BY 4.0.\n'
        'import type { UiStyleDefinition } from "$/base/theme/theme-types";\n\n'
        + "export const macintoshGeometry = " + json.dumps(geometry, indent=2)
        + ' satisfies Omit<UiStyleDefinition, "colors">;\n\n'
        + "export const macintoshSheetHashes = " + json.dumps(hashes, indent=2) + " as const;\n\n"
        + "export const macintoshPalettes = " + json.dumps(palettes, indent=2) + " as const;\n"
    )
    subprocess.run(["pnpm", "exec", "oxfmt", "--config", "infra/oxfmt.json",
                    str(geometry_path)], cwd=ROOT, check=True)
    print(f"Generated Macintosh light/dark artwork for {len(parts)} control parts.")


if __name__ == "__main__":
    generate()
