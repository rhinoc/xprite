# Pixel Art UI Primitives

Reusable Aseprite-styled React components for the editor and other pixel-art
apps. This package owns the Aseprite light/dark theme, cursor atlas, and font
assets, component artwork, layout, and reusable interaction behavior. Editor state,
commands, file formats, and color-profile conversion stay in the app; controls
receive values and callbacks through props.

Assets are grouped by purpose, then source: `assets/themes/aseprite/` contains
the theme sheets and source definitions, `assets/cursors/aseprite/` contains
cursor SVGs and their manifest, and `assets/fonts/{aseprite,fusion-pixel}/`
contains each font family's files. Asset extraction and theme generation write
to these same directories; licenses remain in `LICENSES/` and `ATTRIBUTION.md`.

`Toast` displays a non-interactive message at the top of its positioned container,
with a downward entrance animation and a polite screen-reader announcement.
Pass localized text through `text`, or `null` to hide it. The caller owns the
trigger and display duration. The entrance animation respects reduced-motion
preferences.

Public component families live in `src/components/<component>`. When a family
has distinct modes, each mode-specific implementation and style lives in
`variants/<variant>` beneath that family. Internal primitives live in `src/base/components`, control policies in
`src/base/controls`, theme assets and context in `src/base/theme`, and generic
helpers in `src/base/utils`.

Drag handles reuse `PointerDragActivation` from `@xprite/ui/utils` to distinguish
taps from dragging. It owns the activation distance (8 client pixels for touch,
1 for mouse or pen), checks the selected `PointerDragAxis`, and stays active
until that gesture ends. Create a new instance on pointer down; use `update`
before changing geometry for two-dimensional or custom drags.

For a one-dimensional resize, use `PointerResizeGesture`. It reuses that same
activation rule and calculates values relative to the pressed position, so an
enlarged hit area does not make the value jump to the pointer. For example:

```tsx
import { PointerDragAxis, PointerResizeGesture } from "@xprite/ui/utils";

// On pointer down, retain this instance for the captured pointer.
resize.current = new PointerResizeGesture(event, {
  axis: PointerDragAxis.Horizontal,
  initialValue: width,
  pixelsPerUnit: scale,
});

// On pointer move and final pointer up, after checking the captured pointer ID.
const nextWidth = resize.current?.valueAt(event);
if (nextWidth != null) setWidth(clamp(nextWidth, minimumWidth, maximumWidth));
```

`pixelsPerUnit` includes CSS zoom/transforms; use the available client extent
for a split ratio, or a negative scale for a handle that grows in the opposite
direction. Before activation, `valueAt` returns `null`. Callers own pointer
capture, release/cancellation, size limits, previews, and committed values.
These helpers apply to drag handles; controls with click-to-set behavior retain
their own interaction policy.

`Tabs` keeps pointer capture while a tab moves out of its strip. Touch movement
uses the shared drag activation rule: swiping along an overflowing strip scrolls
it, dragging out of the strip can detach the tab, and holding first permits
reordering without scrolling. Set `dragEnabled={false}` to lock tab placement
while keeping touch scrolling and selection. Consumers implement floating and
docking through `onDragMove` and `onDragEnd`; `onReorder` is optional. Context
menus on draggable tabs should use `LongPressActivation.Release`, so holding
and dragging can finish before a stationary release opens the menu.

The package includes a unified Aseprite-themed `Button` with theme, icon, color,
touch, and tool appearance variants. Selection is a state prop; theme buttons are
the default. The color variant accepts `readOnly` for inert previews that keep
their original color. It also includes labels, entries, and text; checkboxes,
sliders, comboboxes, menus, tooltips, scrollbars, overlays, touch panels, and
canvas surfaces. Editor-specific panels and workflows are composed by the app
from these reusable controls.

Behavior composition should reuse an existing DOM element. `Tooltip` adds its
events and ARIA description to the child, and measures the interactive element
that receives the event. Custom trigger components must pass those props to
their actual control. Existing refs are preserved. `TooltipGroup` similarly
reuses one existing container for its shared pointer-leave boundary.

For explicit composition, pass a function child and merge the control's props
through `getTriggerProps`:

```tsx
import { Button, Tooltip } from "@xprite/ui";

<Tooltip text="Brush type">
  {(getTriggerProps) => (
    <Button
      {...getTriggerProps({
        buttonRef: triggerRef,
        onPointerDown: openBrushPicker,
        "aria-label": "Brush type",
      })}
      text="Brush type"
    />
  )}
</Tooltip>;
```

The getter keeps existing handlers, invokes them before tooltip behavior, and
respects `stopPropagation`. Calling `preventDefault` still permits tooltip
behavior, as it did when that behavior lived on an ancestor. Keep containers
that own layout, clipping, scrolling, or an interaction region shared by
multiple controls; component boundaries alone do not require DOM wrappers.

Pure `UiPart` artwork uses its SVG as the existing layout node; parts with
content or interaction handlers retain an HTML host. Shared atlas regions cache
their source clips. Color button frames and repeated divider tiles use compact
rendering at integer presentation scales. Fractional scales retain their
original per-slice/per-tile viewports so edge resampling stays unchanged.
Transparent color checker cells retain their original painter and cache their
geometry rather than introducing gradient edge differences.

`ScrollArea` batches observer-driven measurements across nested areas, ignores
bounded SVG artwork changes, and does not attach geometry observers when both
axes are disabled. Positioned overlay content uses the existing scroll content
plane. `data-slot` identifies artwork, scroll viewports/content, and overlay
boundaries for DOM debugging.

`ContextMenu` follows the same rule: its child is the existing context target,
and receives right-click, menu-key, and optional touch double-tap handlers.
Refs and styles owned by the target remain intact. Custom targets must forward
the handlers to their DOM root, as `Tabs` does. A function child receives
`getTargetProps` for explicit binding and event composition. Capture handlers
retain their ancestor-first order, and bubbling handlers retain their
child-first order; `preventDefault` suppresses opening a context menu.

`CursorProvider` makes the package cursor styles available to a subtree, and
`cursorStyle` returns an image cursor string with its atlas hotspot for canvas
and other imperative surfaces. Import `@xprite/ui/style.css` to include the
cursor artwork and CSS variables.

`Slider` exposes `Normal`, `Threshold`, `TimelineRange`, and `Entry` modes through
`SliderVariant`. `SliderVariant.TimelineRange` provides a discrete, two-handle
timeline selection with themed artwork, keyboard support, and captured pointer
input; an editor adapter translates handle movement into editor settings. The
`Entry` mode retains its compact `mini` option, and threshold/color-channel
controls keep using the theme's mini slider artwork where appropriate.

Movable windows and anchored popups share the `Overlay` component. Select the
behavior with `OverlayVariant.Window` or `OverlayVariant.Popup`:

```tsx
import { Overlay, OverlayVariant } from "@xprite/ui";

<Overlay
  variant={OverlayVariant.Window}
  open={open}
  onOpenChange={setOpen}
  title="Document"
  defaultBounds={{ x: 40, y: 40, width: 420, height: 300 }}
>
  {content}
</Overlay>;
```

```tsx
import {
  Button,
  ButtonVariant,
  Checkbox,
  Entry,
  Text,
  TextVariant,
  Panel,
  Text,
  TextVariant,
  UIProvider,
} from "@xprite/ui";
import "@xprite/ui/style.css";

export function ToolCard() {
  return (
    <UIProvider appearance="dark">
      <Panel title="Brush">
        <Text variant={TextVariant.Inline}>Brush size</Text>
        <Text
          variant={TextVariant.PositionedPixel}
          text="Status"
          x={0}
          y={0}
          color="currentColor"
        />
        <Text variant={TextVariant.Control} text="Project name" />
        <Entry value="" aria-label="Project name" />
        <Checkbox
          bounds={{ x: 0, y: 0, width: 132, height: 32 }}
          label="Pixel perfect"
          checked
          onCheckedChange={() => {}}
        />
        <Button variant={ButtonVariant.Standard} text="Apply" />
      </Panel>
    </UIProvider>
  );
}
```

The gallery app is a visual showcase of this package's current exports. Assets
and font licenses are listed in `ATTRIBUTION.md` and `LICENSES/`.

`RichText` displays read-only rich content through one component. Pass JSX as
`children` for existing headings, paragraphs, links, tables and other markup, or
pass a `markdown` string for a Markdown document. The two inputs are mutually
exclusive in the prop types; `Text` remains the component for individual labels
and text runs.

```tsx
<RichText>
  <h2>Animation notes</h2>
  <p>Keep the background transparent.</p>
</RichText>

<RichText markdown={"## Animation notes\n\nKeep the background transparent."} />
```

Markdown content uses shared pixel text and theme dividers. It supports headings,
paragraphs, flat ordered and unordered lists, strong text, inline code, HTTP(S)
links, local heading links and standalone images. Supply `resolveImage` to map
image paths to URLs and display dimensions; images retain those dimensions and
scroll horizontally when wider than the reading area, with alt text as a caption.
HTML in Markdown is shown as text. The first heading has no leading divider;
consecutive headings share a section without an intervening divider. Compose
`RichText` with `ScrollArea` for long documents; content localization and document
selection remain with the application.

`ScrollArea` updates scroll positions separately from content measurements and
keeps stationary scrollbars outside the scrolled artwork's alignment context.
Physical pixel alignment changes are propagated only for fractional movement.
Hidden tabs retain their last visible geometry so showing them preserves the
native scroll position.

`Combobox` can set `fitPopupToContent` to widen its option list to fit labels
without changing the trigger size. The popup remains constrained to the viewport.

## Typography and color tokens

`base/theme/semantic-presentation-tokens.ts` supplies complete defaults for every
skin: primary/compact/code font roles, reading/field/code metrics, metadata,
danger colors and ink/paper/border/separator/chrome roles. Theme descriptors can
override individual values. Runtime and Macintosh static styles call the same
pure helpers; regenerate static token CSS with `pnpm run assets:macintosh-theme`.

Use `--ui-color-border` for hard control edges and `--ui-color-line` for subdued
separators. Note palettes and typography live in `base/theme/note-tokens.ts`;
components bind those roles rather than redefining palette values. Window fonts
use the active skin's compact role, so another skin does not import Macintosh
fonts. Component CSS consumes these guaranteed variables without visual literals.

Pages may provide a cohesive typography preset for deliberate locale or marketing
metrics; growth imports its site preset for both static and interactive rendering.
Do not override inherited palette values through `.xse-global` or per-page control
CSS. Source pictures, bitmap contrast glyphs, mask colors and business rendering
colors retain their original data.

## Macintosh desktop windows

`PanelVariant.Window` composes the titlebar, body and optional footer. Choose
`PanelWindowKind.Document`, `Utility`, `Dialog`, `About` or `Note` by the surface's
purpose. Document and Utility windows support WindowShade by default: a titlebar
single click activates; a double click rolls the body up or restores it.
`collapsed` / `onCollapsedChange` support controlled state; `defaultCollapsed`
sets the initial state. Enter or Space on a focused caption also toggles it.
The body remains mounted, preserving field values and application state.

`WindowWorkspace` owns presentation-only window positions and stacking. Drag a
titlebar to move a window, click or keyboard-focus its content to raise it, and
press Escape during dragging to cancel the movement. Mark layout ancestors with
`data-ui-desktop-layer` when their stacking context must rise with the window.
Static public pages use `connectWindowWorkspace(root, { staticWindowShade: true })`
to apply the same titlebar behavior to server-rendered window markup.

`Note` uses the source kit's seven paper colors and its close, corner collapse
and resize controls. Set `NoteDismissBehavior.Collapse` and supply `title` to
keep a named caption after closing so the note can be restored.

`Icon` uses the original Mac OS 8.0 Platinum icon pixels under
`assets/icons/desktop/macos8/`, including native 16×16 artwork for menu rows;
extraction provenance and Apple copyright
information are stored with those assets. `Pattern` supplies repeating
tiles. Articles select a stable tile from their canonical path.

`ButtonVariant.Tile` composes an icon through `slots.leading` and a caption
through `text` or `slots.content`, with native button or link behavior.
`PanelVariant.Group` supplies a captioned border; `PanelGroupBorder` chooses
a single or etched edge. `TextVariant.Control` supplies theme translation,
alignment and optional pixel bounds without implying an HTML form label.
`ListBoxSelectionMode` chooses single or multiple selection; separators group
rows, while `renderItem` and `renderGroup` supply custom content.

The pattern catalog is generated from the curated original desktop resources
with `pnpm run assets:desktop-patterns`. `PatternVariant` and `PATTERNS` describe
125 retained tiles; removed imitation IDs have no compatibility aliases.
`Pattern` accepts `foreground` and `background` for two-color masks, `preview`
to isolate a swatch from the host's desktop override, and `scale` for display
size. Fixed-color artwork uses original PNG pixels. Source records and exclusions
are retained with the assets. Two-color patterns share shapes across inverted,
translated and recolored source variants, and can be recolored without copying
assets. Apple pattern artwork is licensed separately from the UI software.
