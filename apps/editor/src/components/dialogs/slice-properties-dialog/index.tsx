import { useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi } from "$/i18n";
import type {
  SlicePoint,
  SliceRect,
  SlicePropertiesEditView,
  SpriteSliceView,
} from "$/managers/dialogs/slice-properties-model";
import { getSliceKeyAt } from "$/managers/dialogs/slice-properties-model";
import { DEFAULT_GUIDE_SLICE_PREFERENCES } from "$/managers/preferences/guide-slice-preferences";
import {
  useUserDataVisibility,
  UserDataVisibilityScope,
} from "$/managers/user-data/user-data-manager";

export interface SlicePropertiesPatch {
  name: string;
  bounds: SliceRect;
  center: SliceRect | null;
  pivot: SlicePoint | null;
  color?: string;
  data?: string;
}

const SLICE_PROPERTIES_FORM_WIDTH = 440;

function integer(value: string) {
  return Math.trunc(Number(value) || 0);
}

function field(
  key: string,
  label: string,
  value: string,
  onChange: (value: string) => void,
  row = key,
): FormField {
  return { key, label, value, type: "text", onChange, row };
}

function checkbox(
  key: string,
  label: string,
  value: boolean,
  onChange: (value: boolean) => void,
  row = key,
): FormField {
  return { key, label, value, type: "checkbox", onChange, row };
}

function textFields(
  prefix: "bounds" | "center" | "pivot",
  values: { x?: number; y?: number; width?: number; height?: number },
  onChange: (key: string, value: string) => void,
  dimensions: readonly ("x" | "y" | "width" | "height")[],
  row: string,
): FormField[] {
  return dimensions.map((dimension) =>
    field(
      `${prefix}.${dimension}`,
      dimension === "x"
        ? "X"
        : dimension === "y"
          ? "Y"
          : dimension === "width"
            ? tUi("ui.width")
            : tUi("ui.height"),
      values[dimension] === undefined ? "" : String(values[dimension]),
      (value) => onChange(`${prefix}.${dimension}`, value),
      row,
    ),
  );
}

export function MultiSlicePropertiesDialog({
  slices,
  defaultColor = DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor,
  onSave,
  onClose,
}: {
  slices: readonly SpriteSliceView[];
  defaultColor?: string;
  onSave: (patch: SlicePropertiesEditView) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [centerMode, setCenterMode] = useState<boolean | null>(null);
  const [pivotMode, setPivotMode] = useState<boolean | null>(null);
  const [color, setColor] = useState(slices[0]?.color ?? defaultColor);
  const [data, setData] = useState(slices[0]?.data ?? "");
  const [dataChanged, setDataChanged] = useState(false);
  const [colorChanged, setColorChanged] = useState(false);
  const [showUserData, setShowUserData] = useUserDataVisibility(UserDataVisibilityScope.Slice);

  const onFieldChange = (key: string, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const patch = () => {
    const rect = (prefix: string): Partial<SliceRect> =>
      Object.fromEntries(
        (["x", "y", "width", "height"] as const).flatMap((key) =>
          Object.prototype.hasOwnProperty.call(draft, `${prefix}.${key}`)
            ? [
                [
                  key,
                  key === "width" || key === "height"
                    ? Math.max(1, integer(draft[`${prefix}.${key}`]))
                    : integer(draft[`${prefix}.${key}`]),
                ],
              ]
            : [],
        ),
      );
    const point = (prefix: string): Partial<SlicePoint> =>
      Object.fromEntries(
        (["x", "y"] as const).flatMap((key) =>
          Object.prototype.hasOwnProperty.call(draft, `${prefix}.${key}`)
            ? [[key, integer(draft[`${prefix}.${key}`])]]
            : [],
        ),
      );
    const bounds = rect("bounds");
    const center = rect("center");
    const pivot = point("pivot");
    onSave({
      ...(Object.prototype.hasOwnProperty.call(draft, "name") ? { name: draft.name } : {}),
      ...(Object.keys(bounds).length ? { bounds } : {}),
      ...(centerMode === false
        ? { center: null }
        : centerMode === true || Object.keys(center).length
          ? { center }
          : {}),
      ...(pivotMode === false
        ? { pivot: null }
        : pivotMode === true || Object.keys(pivot).length
          ? { pivot }
          : {}),
      ...(dataChanged ? { data } : {}),
      ...(colorChanged ? { color } : {}),
    });
  };

  const fields: FormField[] = [
    field(
      "name",
      tUi("ui.slice.name"),
      draft.name ?? "",
      (value) => onFieldChange("name", value),
      "name-row",
    ),
    {
      key: "user-data-toggle",
      label: tUi("ui.user.data"),
      type: "button",
      icon: "icon_user_data",
      expanded: showUserData,
      onClick: () => setShowUserData(!showUserData),
      row: "name-row",
    },
    ...textFields("bounds", {}, onFieldChange, ["x", "y", "width", "height"], "bounds"),
    checkbox(
      "centerMode",
      `${tUi("ui.9.slices")} (*)`,
      centerMode === true,
      (value) => setCenterMode(value),
      "options",
    ),
    checkbox(
      "pivotMode",
      `${tUi("ui.pivot")} (*)`,
      pivotMode === true,
      (value) => setPivotMode(value),
      "options",
    ),
    ...textFields("center", {}, onFieldChange, ["x", "y", "width", "height"], "center"),
    ...textFields("pivot", {}, onFieldChange, ["x", "y"], "pivot"),
    ...(showUserData
      ? [
          {
            key: "color",
            label: "Color:",
            type: "color" as const,
            value: color,
            onChange: (value: string) => {
              setColor(value);
              setColorChanged(true);
            },
            row: "user-data-color",
          },
          field(
            "data",
            tUi("ui.user.data"),
            data,
            (value) => {
              setData(value);
              setDataChanged(true);
            },
            "user-data-text",
          ),
        ]
      : []),
  ];

  return (
    <>
      <FormDialog
        open
        selectInitialInput
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`${tUi("ui.slice.properties")} (${slices.length})`}
        fields={fields}
        width={SLICE_PROPERTIES_FORM_WIDTH}
        layout={{
          fields: {
            name: { x: 8, y: 8, width: 360, labelWidth: 72, height: 30, inset: 0 },
            "user-data-toggle": { x: 376, y: 8, width: 32, height: 30, inset: 0 },
          },
        }}
        actions={[
          { label: tUi("ui.cancel"), onClick: onClose },
          { label: tUi("ui.ok"), onClick: patch },
        ]}
      />
    </>
  );
}

export function SlicePropertiesDialog({
  slice,
  frame,
  defaultColor = DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor,
  onSave,
  onClose,
}: {
  slice: SpriteSliceView;
  frame: number;
  defaultColor?: string;
  onSave: (patch: SlicePropertiesPatch) => void;
  onClose: () => void;
}) {
  const key = getSliceKeyAt(slice, frame);
  const bounds = key?.bounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const [name, setName] = useState(slice.name);
  const [box, setBox] = useState(bounds);
  const [hasCenter, setHasCenter] = useState(!!key?.center);
  const [center, setCenter] = useState(
    key?.center ?? {
      x: 1,
      y: 1,
      width: Math.max(1, bounds.width - 2),
      height: Math.max(1, bounds.height - 2),
    },
  );
  const [hasPivot, setHasPivot] = useState(!!key?.pivot);
  const [pivot, setPivot] = useState(key?.pivot ?? { x: 0, y: 0 });
  const [color, setColor] = useState(slice.color ?? defaultColor);
  const [data, setData] = useState(slice.data ?? "");
  const [showUserData, setShowUserData] = useUserDataVisibility(UserDataVisibilityScope.Slice);

  const updateRect = (
    current: SliceRect,
    set: (value: SliceRect) => void,
    key: keyof SliceRect,
    text: string,
  ) => {
    const value = integer(text);
    set({ ...current, [key]: key === "width" || key === "height" ? Math.max(1, value) : value });
  };
  const patch = () =>
    onSave({
      name,
      bounds: { ...box, width: Math.max(1, box.width), height: Math.max(1, box.height) },
      center: hasCenter
        ? { ...center, width: Math.max(1, center.width), height: Math.max(1, center.height) }
        : null,
      pivot: hasPivot ? pivot : null,
      ...(color !== slice.color ? { color } : {}),
      ...(data !== slice.data && (data !== "" || slice.data !== undefined) ? { data } : {}),
    });

  const fields: FormField[] = [
    field("name", tUi("ui.slice.name"), name, setName, "name-row"),
    {
      key: "user-data-toggle",
      label: tUi("ui.user.data"),
      type: "button",
      icon: "icon_user_data",
      expanded: showUserData,
      onClick: () => setShowUserData(!showUserData),
      row: "name-row",
    },
    ...textFields(
      "bounds",
      box,
      (_key, value) => updateRect(box, setBox, _key.split(".")[1] as keyof SliceRect, value),
      ["x", "y", "width", "height"],
      "bounds",
    ),
    checkbox("center", tUi("ui.9.slices"), hasCenter, setHasCenter, "options"),
    checkbox("pivot", tUi("ui.pivot"), hasPivot, setHasPivot, "options"),
    ...(hasCenter
      ? textFields(
          "center",
          center,
          (_key, value) =>
            updateRect(center, setCenter, _key.split(".")[1] as keyof SliceRect, value),
          ["x", "y", "width", "height"],
          "center",
        )
      : []),
    ...(hasPivot
      ? textFields(
          "pivot",
          pivot,
          (_key, value) => setPivot({ ...pivot, [_key.split(".")[1]]: integer(value) }),
          ["x", "y"],
          "pivot",
        )
      : []),
    ...(showUserData
      ? [
          {
            key: "color",
            label: "Color:",
            type: "color" as const,
            value: color,
            onChange: setColor,
            row: "user-data-color",
          },
          field("data", tUi("ui.user.data"), data, setData, "user-data-text"),
        ]
      : []),
  ];

  return (
    <>
      <FormDialog
        open
        selectInitialInput
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={tUi("ui.slice.properties")}
        fields={fields}
        width={SLICE_PROPERTIES_FORM_WIDTH}
        layout={{
          fields: {
            name: { x: 8, y: 8, width: 360, labelWidth: 72, height: 30, inset: 0 },
            "user-data-toggle": { x: 376, y: 8, width: 32, height: 30, inset: 0 },
          },
        }}
        actions={[
          { label: tUi("ui.cancel"), onClick: onClose },
          { label: tUi("ui.ok"), onClick: patch },
        ]}
      />
    </>
  );
}
