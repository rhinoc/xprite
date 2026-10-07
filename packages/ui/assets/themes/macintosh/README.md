# Macintosh skin assets

`pnpm assets:macintosh-theme` (Pillow required) writes the independent light/dark
atlases, geometry and palette modules. Edit the palette or generator for atlas
parts; typography, component bindings and native surface tokens live in the
Macintosh theme's `artwork.ts`.

The reference is [Brian Levy's Classic Macintosh UI Kit](https://www.figma.com/design/vtQqsdZXxS62lGC06GeFll/Classic-Macintosh-UI-Kit--Community-).
Original PNG/SVG exports, rather than scaled Figma previews, supplied the
measurements. The kit has no dark counterpart; dark mode is a palette adaptation.
Folder tabs and native range sliders additionally reference Apple's
[Mac OS 8 Human Interface Guidelines](https://dev.os9.ca/techpubs/mac/HIGOS8Guide/thig-29.html).
Their scalable drawings live in `appearance-artwork.ts`; Apple screenshots and
icon assets are not bundled. Tabs use 22px faces and a 24px strip, with widths
computed from captions and optional actions. Native sliders use a 5px rail and
13×16px directional thumb. These are themed adaptations of later classic Mac
controls, separate from the System 7 Figma sample comparisons.
User images and color swatches retain their colors.

Buttons use orthogonal SVG nine-slice contours, with 1px edges and 3px corner
caps. Standard faces are 80×20, compact faces are 80×16, and default-action rings
are 88×28. Slotted buttons, native links and pixel buttons share the same frame.
Optional theme bindings select the standard part and per-font baseline offset;
Aseprite keeps its original parts, dimensions and typography.

The window titlebar is 19px including its bottom separator. Six 1px stripes have
2px pitch and equal margins; an opaque title cutout separates the text from the
stripes. The left close control has a 13px slot containing an 11px box. Alert
frames have a separate beveled border, warning contour and action layout.

Entries have 1px frames and a 5px text inset. Pop-up controls are 156×18 with a
1px hard shadow starting 3px down/right. Pop-up menu rows are 16px, with the same
bare checkmark and inverted selected row as regular menus. Menubar faces have
1px vertical margins. Fieldsets cut their labels out of the top border. List
frames have a 2px outer stroke, 1px gap and 1px inner stroke.

Classic scrollbars have 16px hollow arrow ends and 16px fixed thumbs, with 2px
thumb side borders. The 4×2 track texture follows the original export. ScrollArea
and PageScrollArea select these bars through theme metadata; Aseprite retains
its compact scrollbars. Explicit mini/transparent variants remain extensions.

Balloon help uses FindersKeepers, 12px padding, a stepped 15×15 frame and eight
independent pointer contours. Pointer insets and text offsets are measured per
contour. Placement fitting remeasures the actual pointer after an edge flip.
Center-edge placements are extensions of the reference corner shapes.

The native DOM renderer consumes optional vector/surface/typography metadata.
Themes without it retain the existing atlas renderer. Atlas derivatives retain
Aseprite attribution; generic Figma frames, textures and warning/pointer contours
retain the Kit attribution. Apple/Susan Kare icon collections are not bundled.
See `packages/ui/ATTRIBUTION.md` and `assets/fonts/macintosh/README.md`.
