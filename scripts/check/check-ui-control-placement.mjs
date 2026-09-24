import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const uiRoot = path.join(root, "packages/ui");
const configPath = path.join(uiRoot, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, uiRoot);
const virtualPath = path.join(uiRoot, "src/control-placement-check.ts");
const source = `
import type { ButtonProps } from "$/components/button";
import type { CheckboxProps } from "$/components/checkbox";
import type { InputProps } from "$/components/input";
import type { LabelProps } from "$/components/label";
import type { ComboboxProps } from "$/components/combobox";
import type { SliderProps } from "$/components/slider";
import type { CurveEditorProps } from "$/components/curve-editor";
import type { DividerProps } from "$/components/divider";
import type { StandardListBoxProps } from "$/components/list-box";
import type { PositionedControlPlacement } from "$/components/control-flow";

const box = { x: 0, y: 0, width: 100, height: 32 };
const size = { width: 50, height: 16 };
const change = () => {};
const checkbox = { label: "Option", checked: false, onCheckedChange: change };
const scalar = { value: 1, min: 0, max: 10, onValueChange: change };
const combo = { value: "", options: [], onValueChange: change, "aria-label": "Choice" };
const curve = { points: [], selectedIndex: 0, onSelectionChange: change, onPointsChange: change, "aria-label": "Curve" };
const list = { items: [], value: "", onValueChange: change, "aria-label": "List" };

({ text: "Button" } satisfies ButtonProps);
({ bounds: box, relativeTo: box } satisfies ButtonProps);
({ ...checkbox } satisfies CheckboxProps);
({ ...checkbox, bounds: box } satisfies CheckboxProps);
({ value: "", pixelSize: size } satisfies InputProps);
({ text: "Label" } satisfies LabelProps);
({ ...combo, pixelSize: size } satisfies ComboboxProps);
({ ...scalar, bounds: box } satisfies SliderProps);
({ ...scalar, pixelSize: size } satisfies SliderProps);
({ ...curve, pixelSize: size } satisfies CurveEditorProps);
({ pixelSize: size } satisfies DividerProps);
({ ...list, pixelSize: size } satisfies StandardListBoxProps);

// @ts-expect-error An authored origin needs complete bounds.
({ relativeTo: { x: 0, y: 0 } } satisfies ButtonProps);
// @ts-expect-error Incomplete bounds must fail instead of defaulting to zero.
({ bounds: { x: 0, y: 0 } } satisfies ButtonProps);
// @ts-expect-error Coordinate and flow dimensions are mutually exclusive.
({ bounds: box, pixelSize: size } satisfies ButtonProps);
// @ts-expect-error A positioned control must provide bounds.
({ relativeTo: box } satisfies PositionedControlPlacement);
// @ts-expect-error A flow input cannot use an authored origin.
({ value: "", pixelSize: size, relativeTo: box } satisfies InputProps);
// @ts-expect-error A flow checkbox cannot use an authored origin.
({ ...checkbox, relativeTo: box } satisfies CheckboxProps);
// @ts-expect-error A flow label cannot use an authored origin.
({ text: "Label", relativeTo: box } satisfies LabelProps);
// @ts-expect-error A flow combobox cannot use an authored origin.
({ ...combo, relativeTo: box } satisfies ComboboxProps);
// @ts-expect-error A slider requires coordinate bounds or explicit flow size.
({ ...scalar } satisfies SliderProps);
// @ts-expect-error A graph requires coordinate bounds or explicit flow size.
({ ...curve } satisfies CurveEditorProps);
// @ts-expect-error A divider requires coordinate bounds or explicit flow size.
({} satisfies DividerProps);
// @ts-expect-error A list requires coordinate bounds or explicit flow size.
({ ...list } satisfies StandardListBoxProps);
`;
const options = {
  ...parsed.options,
  noEmit: true,
  composite: false,
  incremental: false,
  tsBuildInfoFile: undefined,
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
host.readFile = (file) => (file === virtualPath ? source : readFile(file));
host.fileExists = (file) => file === virtualPath || fileExists(file);
const program = ts.createProgram({ rootNames: [...parsed.fileNames, virtualPath], options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else console.log("UI source types and control-placement contracts passed (no emit).");
