# Pixel Art UI Primitives

Reusable React controls, layout and interaction primitives for pixel-art apps.
Visual themes supply artwork, fonts, cursors and presentation tokens. Applications
own document state, commands, file formats and color-profile conversion; controls
receive values and callbacks.

Window presentation and interaction can be composed independently. `PanelFrame`
renders window artwork and content, using `PanelFrameLayout.Flow` for page layout
or Scene for authored editor coordinates. Compose dismissal, dragging, resizing
and disclosure through the interaction helpers. `Panel` supplies a disclosure preset.

`FloatingLayer` places arbitrary content in scene coordinates; its `rootProps`
receive the owning control's role, label, focus and keyboard handlers.
`useOverlayInteraction` supplies dismissal and focus restoration, with
`OverlayInteractionScope` preserving child-layer ownership through React portals.
`useWindowGesture` supplies dragging and resizing. Modal hosts use `useModalFocus`
for focus containment and restoration and retain their backdrop and submission
rules.

`Dialog` and `Popover` compose these parts with their default scene artwork.
Their `renderFrame` prop replaces presentation without replacing placement or
interaction. `usePopoverPosition` supplies anchoring alone; `useAnchoredPopover`
combines it with the shared dismissal behavior for an existing popup element.

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

Public options name one dimension at a time: `variant` selects a control
structure, `mode` selects behavior, `border` configures the frame, `rendering`
selects how a value is drawn, and `layout` arranges content. `tone`, `size`,
`density`, `font`, and `placement` describe semantic color, dimensions, spacing,
typography, and position. Omit an option to use its documented default.
`Neutral`, `Info`, `Success`, `Warning`, and `Error` are shared tone names.
`Accent` is a surface tone; `Muted` is a text tone. `FontRole.Primary` and
`FontRole.Compact` select text sizing roles.
`UiColorScheme.Light` and `Dark` select the light or dark palette; `theme` selects
the independent visual skin, such as Aseprite or Macintosh.
Use `TextInk.Light` or `Dark` for explicit inline pixel-text contrast, and
`TextAlignment.Left`, `Center`, or `Right` for positioned control labels.

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

`ButtonVariant` selects Push, Icon, FlatIcon, Color, Tool, Split, or Tile
structure; Push is the default. `ButtonAppearance.Quiet` removes the raised frame
where supported. Selection is a state prop. `readOnly` keeps button previews
inert without changing their artwork, including quiet buttons and split-button
dropdowns. It also includes labels, entries, and text; checkboxes,
sliders, comboboxes, menus, tooltips, scrollbars, overlays, touch panels, and
canvas surfaces. Editor-specific panels and workflows are composed by the app
from these reusable controls.

`MenuActivation` chooses Click, Press or ContextMenu independently of theme
artwork. Menubar uses Press by default and exposes `menuActivation` separately
from its layout. `Menu` defaults to toggling an open trigger; hover-enabled
menubars keep it open when activated. Flow menu titles highlight only while
their menu is open; keyboard focus uses an outline. Disabled or read-only
triggers cannot open a menu.

Behavior composition should reuse an existing DOM element. `Tooltip` adds its
events and ARIA description to the child, and measures the interactive element
that receives the event. Custom trigger components must pass those props to
their actual control. Existing refs are preserved. `TooltipGroup` similarly
reuses one existing container for its shared pointer-leave boundary.
`TooltipPlacement.Top`, `Bottom`, side and corner values set a fixed position;
`TooltipPlacement.Auto` chooses a side that fits.

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
behavior. Keep containers
that own layout, clipping, scrolling, or an interaction region shared by
multiple controls; component boundaries alone do not require DOM wrappers.

Pure `UiPart` artwork uses its SVG as the existing layout node; parts with
content or interaction handlers retain an HTML host. Shared atlas regions cache
their source clips. Color button frames and repeated divider tiles use compact
rendering at integer presentation scales. Fractional scales retain their
original per-slice/per-tile viewports so edge resampling stays unchanged.
Color checkers cache the geometry of their source-pixel cells.

`ScrollAreaTarget.Element` is the default for local viewports; use
`target={ScrollAreaTarget.Page}` for native document scrolling, anchors and fixed
elements. The default `scrollbarRendering` is Skinned; set
`scrollbarRendering={ScrollbarRendering.Browser}` for browser scrollbars.
`scrollbarStyle` selects Compact, Classic or Transparent artwork. `reserveScrollbarGutter` defaults to
false for Element and true for Page. `documentGutter` enhances an existing static
document. Element and Page have separate option types.

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

`CursorProvider` supplies the active theme's cursor variables to a subtree.
`cursorStyle` returns the CSS reference for a cursor role; `getCursorArtwork`
provides its image and hotspot for canvas and other imperative surfaces.
Import `@xprite/ui/style.css` for the shared cursor styles.

`SliderRendering.Pixel` draws the theme's slider; `NumberEntry` supplies the
editable number and popup slider, while `BrowserRange` uses an HTML range
input. Color channel sliders use the theme's artwork where appropriate.
`SliderValueFormat.Integer` and `Percentage` control number-entry formatting.
`DividerAppearance.Panel`, `Content`, and `Heading` select the divider's context.

`Dialog` supplies movable windows; `Popover` supplies anchored popup surfaces.
Opening, modality, movement and dismissal are explicit behavior props.

```tsx
import { Dialog } from "@xprite/ui";

<Dialog
  open={open}
  onOpenChange={setOpen}
  title="Document"
  defaultBounds={{ x: 40, y: 40, width: 420, height: 300 }}
>
  {content}
</Dialog>;
```

```tsx
import {
  Button,
  ButtonVariant,
  Checkbox,
  Input,
  Text,
  TextVariant,
  Panel,
  UIProvider,
  UiColorScheme,
} from "@xprite/ui";
import "@xprite/ui/style.css";

export function ToolCard() {
  return (
    <UIProvider colorScheme={UiColorScheme.Dark}>
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
        <Input value="" readOnly aria-label="Project name" />
        <Checkbox
          bounds={{ x: 0, y: 0, width: 132, height: 32 }}
          label="Pixel perfect"
          checked
          onCheckedChange={() => {}}
        />
        <Button variant={ButtonVariant.Push} text="Apply" />
      </Panel>
    </UIProvider>
  );
}
```

The components app is a visual showcase of this package's current exports. Assets
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

## Independent themes

A visual theme owns its font descriptors, cursor artwork, atlas bindings and
presentation tokens. `UiTheme` supplies synchronous `typography` and `cursors`
metadata, then loads light or dark artwork and font-face CSS through
`load(colorScheme)`. `UIProvider` takes `colorScheme` and `theme` separately.

To add a theme, add its entry, font metadata/CSS and artwork under
`base/theme/themes/<name>/` and keep original font/image assets in `assets/`.
Expose the entry and pass it to `UIProvider`. Existing native-font and bitmap
renderers require no changes to shared controls. Bitmap descriptors provide the
atlas URL, dimensions and glyph map; native descriptors provide the font family
and advances. Both declare CJK fallback metrics and the text alignment grid.
Only declared bitmap atlases are loaded. `UiAssets.fontAtlases` and
`UiAssets.style.typography` describe the selected theme together.

Themes provide the logical part bindings used by their controls. Reusing another theme's asset
set is an explicit choice in the theme entry, as with the current pixel cursors.
An empty cursor set uses system cursor fallbacks. Cursor caches are scoped to the
artwork set, and `CursorProvider` supplies the current theme's cursor variables.

Control input rules belong to components and their application owners. Menus
opened with a pointer start without a selected item; keyboard opening selects
the first enabled item. A controlled menu receives `MenuOpeningInput` from its
owner. Theme configuration supplies visual properties such as popup frames,
focus marks and tooltip artwork.

## Typography and color tokens

`base/theme/typography-tokens.ts` owns shared reading and window typography.
Each role has a family, size and line-height token:

| Role            | Family                         | Size                                | Line height                           |
| --------------- | ------------------------------ | ----------------------------------- | ------------------------------------- |
| Window title    | `--ui-panel-window-title-font` | `--ui-panel-window-title-font-size` | `--ui-panel-window-title-line-height` |
| Content title   | `--ui-reading-title-font`      | `--ui-reading-title-size`           | `--ui-reading-title-line-height`      |
| Content heading | `--ui-reading-heading-font`    | `--ui-reading-heading-size`         | `--ui-reading-heading-line-height`    |
| Body            | `--ui-reading-body-font`       | `--ui-reading-body-size`            | `--ui-reading-line-height`            |
| Caption         | `--ui-reading-caption-font`    | `--ui-reading-caption-size`         | `--ui-reading-caption-line-height`    |
| Code            | `--ui-code-font`               | `--ui-code-size`                    | `--ui-code-line-height`               |

Macintosh window overrides live beside the font metrics in
`base/theme/themes/macintosh/typography.ts`. Font-face size adjustment stays in
the font asset CSS; changing a reading role does not redefine the glyph grid.
The growth site's typography preset supplies showcase note and heading metrics.

`base/theme/semantic-presentation-tokens.ts` supplies complete defaults for every
skin: primary/compact/code font roles, reading/field/code metrics, metadata,
danger colors and ink/paper/border/separator/chrome roles. Theme descriptors can
override individual values. Runtime and Macintosh static styles call the same
pure helpers; regenerate static token CSS with `pnpm run assets:macintosh-theme`.

Use `--ui-color-border` for hard control edges and `--ui-color-line` for subdued
separators. Note palettes and typography live in `base/theme/note-tokens.ts`;
components bind those roles rather than redefining palette values. Window titles and footers use their dedicated font tokens. Component CSS
consumes these variables.

Pages may provide a cohesive typography preset for deliberate locale or marketing
metrics; growth imports its site preset for both static and interactive rendering.
Do not override inherited palette values through `.xse-global` or per-page control
CSS. Source pictures, bitmap contrast glyphs, mask colors and business rendering
colors retain their original data.

## Macintosh desktop windows

Window panels compose the titlebar, body and optional footer. Choose
`PanelVariant.Document`, `Utility` or `Dialog` by the surface's purpose.
Dialog captions are centered by default. `titleAlign={PanelTitleAlignment.Start}`
left-aligns the title, and `titleFont={FontRole.Compact}` uses the compact font.
Set `emphasized` for a stronger frame and titlebar. Document and Utility panels
enable WindowShade by default; Dialog panels keep a fixed caption. Set
`collapsible` explicitly to choose the behavior. A titlebar
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

`PanelVariant.Note` renders plain paper using the source kit's seven colors
through `noteColor={PanelNoteColor.Yellow}`. `PanelVariant.NoteWindow` adds close,
corner collapse and resize controls.
Set `PanelDismissBehavior.Collapse` and supply `title` to keep a named caption
after closing so the note can be restored.

`Icon` takes `kind` for desktop artwork, system glyphs and theme atlas parts.
Desktop artwork and glyphs use `size`; atlas parts retain their source-pixel
`scale`, position, tint and state options. The Icon page in Web Components displays all
icons together; search by name and click an icon to copy its key.

`Icon` uses the original Mac OS 8.0 Platinum icon pixels under
`assets/icons/desktop/macos8/`, including native 16×16 artwork for menu rows;
extraction provenance and Apple copyright
information are stored with those assets. `Pattern` supplies repeating
tiles. Articles select a stable tile from their canonical path.

`ButtonVariant.Tile` composes an icon through `slots.leading` and a caption
through `text` or `slots.content`, with native button or link behavior.
`PanelVariant.Content` follows the active theme's panel presentation.
Omit `border` for its single frame, pass `border={false}` for no frame, or set
`border={{ style: PanelBorderStyle.Etched }}` for an etched frame. `TextVariant.Control` supplies theme translation,
alignment and optional pixel bounds without implying an HTML form label.
`ListBoxMode.Single` is the default; Multiple accepts a collection of selected
values, while Navigation takes native `NavigationListBoxItem` links. `activeHref`
marks the current location. Link focus, modifier clicks and new-tab behavior stay
native. `border` configures the frame independently of the selection mode: omit it
or pass `true` for the skin's inset frame, pass `false` to remove the frame, or
pass `{ style: ListBoxBorderStyle.Single }`, `{ style: ListBoxBorderStyle.Inset }`
or `{ style: ListBoxBorderStyle.Thick }` to choose a frame. Frame insets and focus
artwork follow that setting. Separators group selection rows, and
`renderItem` / `renderGroup` supply custom content.

`CheckboxMode.Toggle` changes a boolean; Radio selects it without clearing it.
`CheckboxShape.Square` and `CheckboxShape.Round` independently choose the square or round
artwork. The behavior determines the ARIA role and selection rule.

The pattern catalog is generated from the curated original desktop resources
with `pnpm run assets:desktop-patterns`. `PatternId` and `PATTERNS` describe
125 retained tiles.
`Pattern` accepts `foreground` and `background` for two-color masks, `preview`
to isolate a swatch from the host's desktop override, and `scale` for display
size. Fixed-color artwork uses original PNG pixels. Source records and exclusions
are retained with the assets. Two-color patterns share shapes across inverted,
translated and recolored source variants, and can be recolored without copying
assets. Apple pattern artwork is licensed separately from the UI software.

`Toast` accepts `tone={ToastTone.Info}`, `Success`, `Warning` or `Error` for
blue, green, yellow or red message colors in light and dark color schemes.
`ToastTone.Neutral` is the default and uses the skin's ordinary notice colors.
The caller owns the message duration; `text={null}` hides it.
