import { useEffect, useRef, useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { ImportSpriteSheetOverlayHost } from "$/components/dialogs/import-sprite-sheet-overlay";
import { useImportSheetEditor } from "$/managers/dialogs/import-sprite-sheet";
import {
  createImportSpriteSheetOptions,
  getImportSpriteSheetTileCounts,
  SPRITE_SHEET_ORIGIN_MIN,
  SpriteSheetLayoutChoice,
  updateImportSpriteSheetOptions,
  useSpriteSheetDialogModel,
  type ImportSpriteSheetDialogOptions,
  type SpriteSheetDialogOptions,
  type SpriteSheetImageView,
  type SpriteSheetPreviewResult,
} from "$/managers/dialogs/sprite-sheet-dialog-model";
import {
  spriteSheetAsepriteLayout,
  importSpriteSheetAsepriteLayout,
} from "$/managers/files/policies/sprite-sheet-geometry";
export interface SpriteSheetDialogProps {
  initialSource?: SpriteSheetDialogOptions["source"];
  onClose(): void;
  onExport(options: SpriteSheetDialogOptions): void;
  busy?: boolean;
  documentKey?: string;
  onPreview?(result: SpriteSheetPreviewResult | null): void;
}
/** Source export_sprite_sheet.xml's four source-skinned section tabs. The form
 * primitive owns all geometry, focus, controls and styling. */
export function SpriteSheetDialog({
  initialSource,
  onClose,
  onExport,
  busy = false,
  onPreview,
  documentKey,
}: SpriteSheetDialogProps) {
  const model = useSpriteSheetDialogModel(documentKey);
  const modelRef = useRef(model);
  modelRef.current = model;
  const document = model.document;
  const [o, set] = useState(() => {
      return model.createInitialOptions(initialSource);
    }),
    [tab, setTab] = useState("layout"),
    [preview, setPreview] = useState(true),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!onPreview) return;
    if (!preview) {
      onPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        onPreview(modelRef.current.renderPreview(o));
      } catch {
        onPreview(null);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [o, preview, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);
  const update = <K extends keyof SpriteSheetDialogOptions>(
    key: K,
    value: SpriteSheetDialogOptions[K],
  ) => set((old) => ({ ...old, [key]: value }));
  const check = (key: keyof SpriteSheetDialogOptions, label: string, row?: string): FormField => ({
    key,
    label,
    row,
    type: "checkbox",
    value: !!o[key],
    onChange: (v) => update(key, v as never),
    disabled: busy,
  });
  const number = (
    key: keyof SpriteSheetDialogOptions,
    label: string,
    min = 0,
    row?: string,
  ): FormField => ({
    key,
    label,
    row,
    type: "number",
    value: Number(o[key]),
    onChange: (v) => update(key, v as never),
    min,
    max: 16384,
    disabled: busy,
  });
  const text = (key: keyof SpriteSheetDialogOptions, label: string): FormField => ({
    key,
    label,
    type: key === "name" || key === "dataName" ? "filename" : "text",
    value: String(o[key]),
    onChange: (v: string) => update(key, v as never),
    disabled: busy,
  });
  const select = (
    key: keyof SpriteSheetDialogOptions,
    label: string,
    items: readonly [string, string][],
  ): FormField => ({
    key,
    label,
    type: "select",
    value: String(o[key]),
    onChange: (v) => update(key, v as never),
    options: items.map(([value, label]) => ({ value, label })),
    disabled: busy,
  });
  const sections: Record<string, FormField[]> = {
    layout: [
      select("layout", "Sheet Type:", [
        [SpriteSheetLayoutChoice.Horizontal, "Horizontal Strip"],
        [SpriteSheetLayoutChoice.Vertical, "Vertical Strip"],
        [SpriteSheetLayoutChoice.Rows, "By Rows"],
        [SpriteSheetLayoutChoice.Columns, "By Columns"],
        [SpriteSheetLayoutChoice.Packed, "Packed"],
      ]),
      select("constraint", "Constraints:", [
        ["none", "None"],
        ["columns", "Fixed # of Columns"],
        ["rows", "Fixed # of Rows"],
        ["width", "Fixed Width"],
        ["height", "Fixed Height"],
        ["size", "Fixed Size"],
      ]),
      ...(o.constraint === "none"
        ? []
        : [
            number(
              "constraintWidth",
              o.constraint === "columns" ? "Columns:" : "Width:",
              1,
              "constraints",
            ),
            number(
              "constraintHeight",
              o.constraint === "rows" ? "Rows:" : "Height:",
              1,
              "constraints",
            ),
          ]),
      check("mergeDuplicates", "Merge Duplicates", "flags"),
      check("ignoreEmpty", "Ignore Empty", "flags"),
      check("powerOfTwo", "Size=x²", "flags"),
    ],
    sprite: [
      {
        key: "source",
        label: "Source:",
        type: "select",
        value: o.source ?? "sprite",
        onChange: (value) => update("source", value as SpriteSheetDialogOptions["source"]),
        options: [
          { value: "sprite", label: "Sprite" },
          { value: "tilesets", label: "Tilesets" },
        ],
        disabled: busy,
      },
      select("layers", "Layers:", [
        ["visible", "Visible layers"],
        ["selected", "Selected layers"],
      ]),
      check("splitLayers", "Split Layers"),
      select("frames", "Frames:", [
        ["all", "All frames"],
        ["selected", "Selected frames"],
        ["current", "Current frame"],
        ...(document.tags.length
          ? document.tags.map((tag) => [`tag:${tag}`, tag] as [string, string])
          : []),
      ]),
      check("splitTags", "Split Tags"),
    ],
    borders: [
      number("borderPadding", "Border Padding:"),
      number("shapePadding", "Spacing:"),
      number("innerPadding", "Inner Padding:"),
      check("trimSprite", "Trim Sprite", "trim"),
      check("trimCels", "Trim Cels", "trim"),
      ...(o.trimCels || o.trimSprite ? [check("trimByGrid", "By Grid")] : []),
      check("extrude", "Extrude"),
    ],
    output: [
      check("imageEnabled", "Output File"),
      ...(o.imageEnabled ? [text("name", "")] : []),
      check("dataEnabled", "JSON Data"),
      ...(o.dataEnabled
        ? [
            text("dataName", ""),
            select("dataFormat", "", [
              ["hash", "Hash"],
              ["array", "Array"],
            ]),
            { key: "metaLabel", label: "Meta:", type: "label" as const },
            check("listLayers", "Layers", "meta"),
            check("listTags", "Tags", "meta"),
            check("listSlices", "Slices", "meta"),
            text("filenameFormat", "Item Filename:"),
            {
              key: "filenameHelp",
              label: "(?)",
              type: "link" as const,
              onClick: () =>
                window.open(
                  "https://www.aseprite.org/docs/cli/#filename-format",
                  "_blank",
                  "noopener",
                ),
            },
            text("tagnameFormat", "Item Tagname:"),
            {
              key: "tagnameHelp",
              label: "(?)",
              type: "link" as const,
              onClick: () =>
                window.open(
                  "https://www.aseprite.org/docs/cli/#tagname-format",
                  "_blank",
                  "noopener",
                ),
            },
          ]
        : []),
    ],
  };
  const fields = expanded ? Object.values(sections).flat() : [...sections[tab]];
  fields.push(check("openGenerated", "Open Sprite Sheet", "footer"), {
    key: "preview",
    label: "Preview",
    type: "checkbox",
    value: preview,
    onChange: setPreview,
    disabled: busy || !onPreview,
    row: "footer",
  });
  const sourceLayout = spriteSheetAsepriteLayout(tab, o);
  return (
    <FormDialog
      open
      title="Export Sprite Sheet"
      helpUrl="https://www.aseprite.org/docs/sprite-sheet/#export"
      width={tab === "output" && o.dataEnabled ? 586 : 584}
      layout={expanded ? undefined : sourceLayout}
      fields={fields}
      headerActions={[
        {
          label: expanded ? "Collapse Sections" : "Show all sections",
          icon: "window_center_icon",
          x: tab === "output" && o.dataEnabled ? 544 : 542,
          y: 0,
          width: 18,
          height: 30,
          onClick: () => setExpanded((value) => !value),
          disabled: busy,
        },
      ]}
      tabs={{
        items: [
          { value: "layout", label: "Layout" },
          { value: "sprite", label: "Sprite" },
          { value: "borders", label: "Borders" },
          { value: "output", label: "Output" },
        ],
        value: tab,
        selectedValues: expanded ? ["layout", "sprite", "borders", "output"] : undefined,
        onChange: (value) => {
          setTab(value);
          setExpanded(false);
        },
      }}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      actions={[
        {
          label: "Export",
          disabled: busy || (!o.imageEnabled && !o.dataEnabled && !o.openGenerated),
          onClick: () => onExport(o),
        },
        { label: "Cancel", disabled: busy, onClick: onClose },
      ]}
    />
  );
}
export interface ImportSpriteSheetDialogProps {
  image: SpriteSheetImageView;
  onClose(): void;
  onImport(options: ImportSpriteSheetDialogOptions): void;
  onSelectFile?(): void;
  busy?: boolean;
}
export function ImportSpriteSheetDialog({
  image,
  onClose,
  onImport,
  onSelectFile,
  busy = false,
}: ImportSpriteSheetDialogProps) {
  const editor = useImportSheetEditor();
  const [o, set] = useState(() => {
    const defaults = createImportSpriteSheetOptions(image),
      doc = editor.snapshot.document,
      header = doc?.timeline?.asepriteSource?.header;
    const bounds = doc?.selection ??
      doc?.timeline?.gridBounds ?? {
        x: header?.gridX ?? 0,
        y: header?.gridY ?? 0,
        width: header?.gridWidth || 16,
        height: header?.gridHeight || 16,
      };
    const next = {
      ...defaults,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    return { ...next, ...getImportSpriteSheetTileCounts(image, next) };
  });
  const update = <K extends keyof ImportSpriteSheetDialogOptions>(
    key: K,
    value: ImportSpriteSheetDialogOptions[K],
  ) => set((old) => updateImportSpriteSheetOptions(image, old, key, value));
  const number = (
    key: keyof ImportSpriteSheetDialogOptions,
    label: string,
    row: string,
    min = 0,
  ): FormField => ({
    key,
    label,
    row,
    type: "number",
    value: Number(o[key]),
    onChange: (v) => update(key, v as never),
    min,
    max: 16384,
    disabled: busy,
  });
  const fields: FormField[] = [
    {
      key: "layout",
      label: "Type:",
      type: "select",
      value: o.layout,
      onChange: (v) => update("layout", v as ImportSpriteSheetDialogOptions["layout"]),
      options: [
        [SpriteSheetLayoutChoice.Horizontal, "Horizontal Strip"],
        [SpriteSheetLayoutChoice.Vertical, "Vertical Strip"],
        [SpriteSheetLayoutChoice.Rows, "By Rows"],
        [SpriteSheetLayoutChoice.Columns, "By Columns"],
      ].map(([value, label]) => ({ value, label })),
      disabled: busy,
    },
    number("x", "X:", "origin", SPRITE_SHEET_ORIGIN_MIN),
    number("y", "Y:", "origin", SPRITE_SHEET_ORIGIN_MIN),
    number("width", "Width:", "size", 1),
    number("height", "Height:", "size", 1),
    {
      ...number("columns", "Columns:", "count", 1),
      disabled: busy || o.layout === SpriteSheetLayoutChoice.Vertical,
    },
    {
      ...number("rows", "Rows:", "count", 1),
      disabled: busy || o.layout === SpriteSheetLayoutChoice.Horizontal,
    },
    {
      key: "paddingEnabled",
      label: "Padding",
      type: "checkbox",
      value: o.paddingEnabled,
      onChange: (v) => update("paddingEnabled", v),
      disabled: busy,
    },
    ...(o.paddingEnabled
      ? [
          number("horizontalPadding", "Horizontal:", "padding"),
          number("verticalPadding", "Vertical:", "padding"),
        ]
      : []),
    {
      key: "partialTiles",
      label: "Include partial tiles at bottom/right edges",
      type: "checkbox",
      value: o.partialTiles,
      onChange: (v) => update("partialTiles", v),
      disabled: busy,
    },
  ];
  const layout = importSpriteSheetAsepriteLayout(o.paddingEnabled);
  return (
    <FormDialog
      open
      title="Import Sprite Sheet"
      helpUrl="https://www.aseprite.org/docs/sprite-sheet/#import"
      width={410}
      layout={layout}
      fields={fields}
      overlay={
        editor.snapshot.document ? (
          <ImportSpriteSheetOverlayHost options={o} onChange={set} />
        ) : undefined
      }
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      actions={[
        { label: "Import", disabled: busy, onClick: () => onImport(o) },
        { label: "Cancel", disabled: busy, onClick: onClose },
        ...(onSelectFile ? [{ label: "Select File", onClick: onSelectFile, disabled: busy }] : []),
      ]}
    />
  );
}
