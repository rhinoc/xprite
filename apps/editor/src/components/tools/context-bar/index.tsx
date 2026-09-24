import { BrushPicker } from "$/components/tools/brush-picker";

import "$/components/tools/context-bar/context-bar.module.css";
import { DynamicsPicker } from "$/components/tools/dynamics-picker";
import { FillReferenceMenu } from "$/components/tools/fill-reference-menu";
import { FontSelector } from "$/components/tools/font-selector";
import { GradientContextBar } from "$/components/tools/gradient-options";
import { InkPicker } from "$/components/tools/ink-picker";
import { SelectionOptions } from "$/components/tools/selection-options";
import { EditorShadeStrip, editorShadeStripWidth } from "$/components/tools/shade-strip";
import { SymmetryControls } from "$/components/tools/symmetry-controls";
import { parseEditorColor as hexToRgba } from "$/managers/tools/color-control";
import { useContextBarEditorModel } from "$/managers/tools/context-bar-model";
import { useReleaseEditorInputFocus } from "$/managers/tools/input-commands";
import {
  ToolEyedropperChannel as EyedropperChannel,
  ToolEyedropperSample as EyedropperSample,
  ToolInk as AsepriteInk,
  ContextBarResizeMethod as PixelResizeMethod,
  TOOL_CONTROL_CHANNEL_MAX as UINT8_MAX,
  getToolControlCapabilities as getXpriteToolCapabilities,
} from "$/managers/tools/tool-options";
import {
  Button,
  Checkbox,
  Combobox,
  ControlFlow,
  ControlFlowItem,
  Input,
  InputTouchActivation,
  Label,
  Slider,
  SliderVariant,
  useUi,
} from "@xprite/ui";
import { measureUiText, uiFontHeight, uiMetrics } from "@xprite/ui/assets";
import { UI_SCALE } from "@xprite/ui/canvas";

function sliderEntryWidth({
  min,
  max,
  suffix = "",
  valueFormat = "integer",
  mini = false,
}: {
  min: number;
  max: number;
  suffix?: string;
  valueFormat?: "integer" | "percentage";
  mini?: boolean;
}) {
  const font = mini ? "mini" : "default";
  const display = (value: number) => `${value}${valueFormat === "percentage" ? "%" : ""}`;
  return (
    Math.max(
      measureUiText(display(min), font),
      measureUiText(display(max), font) + Math.max(measureUiText(suffix, font), 4),
    ) + 16
  );
}

function checkboxSize(label: string, mini = false) {
  const font = mini ? "mini" : "default";
  return {
    width: Math.max(28, measureUiText(label, font) + 36),
    height: Math.max(16, uiFontHeight(font)) + 8,
  };
}

export function ContextBar({ flow = false }: { flow?: boolean } = {}) {
  const editor = useContextBarEditorModel();
  const releaseEditorFocus = useReleaseEditorInputFocus();
  const { style, translateSource } = useUi();
  const metrics = uiMetrics(style);
  const capabilities = getXpriteToolCapabilities(editor.tool);
  const isSelection = [
    "marquee",
    "lasso",
    "elliptical_marquee",
    "polygonal_lasso",
    "magic_wand",
  ].includes(editor.tool);
  const isBucket = editor.tool === "bucket";
  const isWand = editor.tool === "magic_wand";
  const isGradient = editor.tool === "gradient";
  let cursor = isSelection ? 682 : 164;
  const take = (visible: boolean, width: number) => {
    if (!visible) return null;
    const x = cursor;
    cursor += width + 8;
    return x;
  };
  const brushX = take(!isGradient && capabilities.controls.brushType, 30);
  const brushSizeWidth = sliderEntryWidth({
    min: 1,
    max: 64,
    suffix: "px",
  });
  const sizeX = take(
    !isGradient && editor.brushShape !== "image" && capabilities.controls.brushSize,
    brushSizeWidth,
  );
  const angleWidth = sliderEntryWidth({
    min: -180,
    max: 180,
    suffix: "°",
  });
  const angleX = take(
    !isGradient &&
      editor.brushShape !== "image" &&
      capabilities.controls.brushAngle &&
      editor.brushSize > 1,
    angleWidth,
  );
  // Keep fill options between the brush and ink fields.
  if (isBucket) cursor = 534;
  const inkX = take(!isGradient && capabilities.settings.hasInk, 30);
  const showOpacity =
    !isGradient &&
    (capabilities.controls.opacity ||
      (capabilities.settings.hasInk &&
        (editor.ink === AsepriteInk.AlphaCompositing || editor.ink === AsepriteInk.LockAlpha)));
  const opacityLabelWidth = measureUiText("Opacity:", "mini");
  const opacityLabelX = take(showOpacity, opacityLabelWidth);
  const opacityWidth = sliderEntryWidth({
    min: 0,
    max: UINT8_MAX,
    valueFormat: "percentage",
  });
  const opacityX = take(showOpacity, opacityWidth);
  const shadeX = take(
    !isGradient && capabilities.settings.hasInk && editor.ink === AsepriteInk.Shading,
    editorShadeStripWidth(editor.inkShade),
  );
  const dynamicsX = take(!isGradient && capabilities.controls.dynamics, 30);
  const sprayWidthWidth = sliderEntryWidth({ min: 1, max: 32 });
  const spraySpeedWidth = sliderEntryWidth({ min: 1, max: 100 });
  const sprayLabelWidth = measureUiText("Spray:", "mini");
  const sprayX = take(
    editor.tool === "spray",
    sprayLabelWidth + 8 + sprayWidthWidth + 8 + spraySpeedWidth,
  );
  const pixelX = !isGradient && capabilities.controls.pixelAlgorithm ? cursor + 4 : null;
  const symmetryX = isGradient
    ? 998
    : isWand
      ? 958
      : isSelection
        ? editor.tool === "marquee"
          ? 738
          : 682
        : pixelX !== null
          ? pixelX - 4 + checkboxSize(translateSource("Pixel-perfect"), false).width + 8
          : cursor;
  const controlHeight = metrics.toolHeight * UI_SCALE;
  return (
    <div
      className="xse-context-bar xse-context"
      data-layout={flow ? "wrap" : "row"}
      style={{
        height: flow ? "auto" : controlHeight,
        width: "100%",
        flex: "1 1 auto",
        ...(flow ? { overflow: "hidden" } : {}),
      }}
    >
      <ControlFlow
        enabled={flow}
        className="xse-context-controls"
        data-layout={flow ? "wrap" : "row"}
        data-palette-toolbar-removed={flow ? undefined : "true"}
        style={{ height: flow ? "auto" : controlHeight }}
      >
        {editor.tool === "text" && editor.functional && editor.font && (
          <FontSelector
            origin={{ x: 164, y: 0 }}
            fontName={editor.font.family}
            fontSize={editor.font.size}
            antialias={editor.font.antialias}
            bold={editor.font.bold}
            italic={editor.font.italic}
            fill={editor.font.fill}
            strokeWidth={editor.font.strokeWidth}
            disabled={!editor.font.enabled}
            onFontChange={editor.setTextFontFamily}
            onSizeChange={editor.setTextSize}
            onAntialiasChange={editor.setTextAntialias}
            onBoldChange={editor.setTextBold}
            onItalicChange={editor.setTextItalic}
            onFillChange={editor.setTextFill}
            onStrokeWidthChange={editor.setTextStrokeWidth}
          />
        )}
        {isSelection && (
          <SelectionOptions
            mode={editor.selectionMode}
            onModeChange={editor.setSelectionMode}
            marquee={editor.tool === "marquee"}
            onCommitted={releaseEditorFocus}
          />
        )}
        {editor.tool === "zoom" && (
          <>
            <ControlFlowItem>
              <Button
                tintDisabledIcon
                bounds={{ x: 164, y: 0, width: 50, height: 32 }}
                text="100%"
                part="buttonset_item_normal"
                hotPart="buttonset_item_hot"
                onClick={() => editor.setZoom(100)}
                aria-label="Zoom to 100%"
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Button
                tintDisabledIcon
                bounds={{ x: 212, y: 0, width: 62, height: 32 }}
                text="Center"
                part="buttonset_item_normal"
                hotPart="buttonset_item_hot"
                disabled={!editor.functional}
                onClick={editor.centerSprite}
                aria-label="Center sprite"
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Button
                tintDisabledIcon
                bounds={{ x: 272, y: 0, width: 90, height: 32 }}
                text="Fit Screen"
                part="buttonset_item_normal"
                disabled={!editor.canFitScreen}
                onClick={editor.fitScreen}
                aria-label="Fit Screen"
              />
            </ControlFlowItem>
            {editor.zoom < 100 && (
              <>
                <ControlFlowItem>
                  <Label bounds={{ x: 370, y: 10, width: 122, height: 14 }} text="Downsampling:" />
                </ControlFlowItem>
                <ControlFlowItem>
                  <Combobox
                    bounds={{ x: 500, y: 0, width: 240, height: 32 }}
                    value={PixelResizeMethod.Nearest}
                    options={[{ value: PixelResizeMethod.Nearest, label: "Nearest-neighbor" }]}
                    onValueChange={() => {}}
                    disabled
                    aria-label="Downsampling"
                  />
                </ControlFlowItem>
              </>
            )}
          </>
        )}
        {editor.tool === "move" && (
          <ControlFlowItem>
            <Checkbox
              bounds={{
                x: 164,
                y: 0,
                width: checkboxSize(translateSource("Auto Select Layer"), true).width,
                height: 32,
              }}
              label="Auto Select Layer"
              mini
              checked={editor.autoSelectLayer}
              onCheckedChange={editor.setAutoSelectLayer}
              onCommitted={releaseEditorFocus}
            />
          </ControlFlowItem>
        )}
        {editor.tool === "eyedropper" && (
          <>
            <ControlFlowItem>
              <Label bounds={{ x: 166, y: 10, width: 42, height: 14 }} text="Pick:" />
            </ControlFlowItem>
            <ControlFlowItem>
              <Combobox
                bounds={{ x: 214, y: 0, width: 168, height: 32 }}
                value={editor.eyedropperChannel}
                options={[
                  { value: EyedropperChannel.ColorAlpha, label: "Color + Alpha" },
                  { value: EyedropperChannel.Color, label: "Color" },
                  { value: EyedropperChannel.Alpha, label: "Alpha" },
                  { value: EyedropperChannel.Rgba, label: "RGB + Alpha" },
                  { value: EyedropperChannel.Rgb, label: "RGB" },
                  { value: EyedropperChannel.Hsva, label: "HSV + Alpha" },
                  { value: EyedropperChannel.Hsv, label: "HSV" },
                  { value: EyedropperChannel.Hsla, label: "HSL + Alpha" },
                  { value: EyedropperChannel.Hsl, label: "HSL" },
                  { value: EyedropperChannel.Graya, label: "Gray + Alpha" },
                  { value: EyedropperChannel.Gray, label: "Gray" },
                  { value: EyedropperChannel.Index, label: "Best fit Index" },
                ]}
                onValueChange={(value) =>
                  editor.setEyedropperChannel(value as typeof editor.eyedropperChannel)
                }
                aria-label="Eyedropper channel"
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Label bounds={{ x: 392, y: 10, width: 68, height: 14 }} text="Sample:" />
            </ControlFlowItem>
            <ControlFlowItem>
              <Combobox
                bounds={{ x: 466, y: 0, width: 238, height: 32 }}
                value={editor.eyedropperSample}
                options={[
                  { value: EyedropperSample.AllLayers, label: "All Layers" },
                  { value: EyedropperSample.CurrentLayer, label: "Current Layer" },
                  {
                    value: EyedropperSample.ReferenceLayer,
                    label: "First Reference Layer",
                  },
                ]}
                onValueChange={(value) =>
                  editor.setEyedropperSample(value as typeof editor.eyedropperSample)
                }
                aria-label="Eyedropper sample"
              />
            </ControlFlowItem>
          </>
        )}
        {(isBucket || isWand) && (
          <>
            <ControlFlowItem>
              <Label
                bounds={{ x: isWand ? 684 : 204, y: 10, width: 90, height: 14 }}
                text="Tolerance:"
                font="mini"
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Input
                touchActivation={InputTouchActivation.DoubleTap}
                bounds={{ x: isWand ? 782 : 302, y: 0, width: 54, height: 32 }}
                value={String(editor.tolerance)}
                aria-label={isWand ? "Wand tolerance" : "Fill tolerance"}
                inputMode="numeric"
                onCommit={(value) => {
                  const number = Number(value);
                  if (value.trim() && Number.isFinite(number))
                    editor.setTolerance(Math.max(0, Math.min(UINT8_MAX, Math.round(number))));
                }}
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Checkbox
                bounds={{ x: isWand ? 844 : 364, y: 0, width: 124, height: 32 }}
                label="Contiguous"
                mini
                checked={editor.contiguous}
                onCheckedChange={editor.setContiguous}
                onCommitted={releaseEditorFocus}
              />
            </ControlFlowItem>
            {isBucket ? (
              <ControlFlowItem>
                <FillReferenceMenu
                  bounds={{ x: 496, y: 0, width: 30, height: 32 }}
                  reference={editor.fillReference}
                  onReferenceChange={editor.setFillReference}
                />
              </ControlFlowItem>
            ) : (
              <ControlFlowItem>
                <Button
                  tintDisabledIcon
                  bounds={{ x: 976, y: 0, width: 30, height: 32 }}
                  icon="timeline_gear"
                  iconOffset={{ x: 2, y: 0 }}
                  disabled
                  aria-label="Paint bucket settings"
                />
              </ControlFlowItem>
            )}
          </>
        )}
        {isGradient && (
          <GradientContextBar
            type={editor.gradientType}
            dither={editor.gradientDither}
            tolerance={editor.tolerance}
            contiguous={editor.contiguous}
            fillReference={editor.fillReference}
            opacity={editor.inkOpacity}
            onTypeChange={editor.setGradientType}
            onDitherChange={editor.setGradientDither}
            onToleranceChange={editor.setTolerance}
            onContiguousChange={editor.setContiguous}
            onFillReferenceChange={editor.setFillReference}
            onOpacityChange={editor.setInkOpacity}
          />
        )}
        {brushX !== null && (
          <ControlFlowItem>
            <BrushPicker
              bounds={{ x: brushX, y: 0, width: 30, height: 32 }}
              value={{
                shape: editor.brushShape,
                size: editor.brushSize,
                angle: editor.brushAngle,
                ...(editor.brushImage ? { image: editor.brushImage } : {}),
              }}
              settings={{ ink: editor.ink, opacity: editor.inkOpacity, shade: editor.inkShade }}
              onSettingsChange={editor.applyBrushSettings}
              pixelPerfect={editor.pixelPerfect}
              onValueChange={editor.setBrush}
              foreground={hexToRgba(editor.foreground)}
              background={hexToRgba(editor.background)}
              foregroundIndex={editor.paletteIndex}
              backgroundIndex={editor.backgroundIndex}
              onCreateFromSelection={() => {
                const image = editor.createBrushImageFromSelection();
                if (image) editor.setTool("pencil");
                return image;
              }}
              canCreateFromSelection={editor.canCreateBrushFromSelection}
              onPixelPerfectChange={editor.setPixelPerfect}
            />
          </ControlFlowItem>
        )}
        {sizeX !== null && (
          <ControlFlowItem>
            <Slider
              variant={SliderVariant.Entry}
              bounds={{ x: sizeX, y: 0, width: brushSizeWidth, height: 32 }}
              value={editor.brushSize}
              min={1}
              max={64}
              suffix="px"
              aria-label="Brush size"
              tooltip="Brush Size (in pixels)"
              onValueChange={editor.setBrushSize}
            />
          </ControlFlowItem>
        )}
        {angleX !== null && (
          <ControlFlowItem>
            <Slider
              variant={SliderVariant.Entry}
              bounds={{ x: angleX, y: 0, width: angleWidth, height: 32 }}
              min={-180}
              max={180}
              value={editor.brushAngle}
              suffix="°"
              aria-label="Brush angle"
              tooltip="Brush Angle (in degrees)"
              onValueChange={editor.setBrushAngle}
            />
          </ControlFlowItem>
        )}
        {inkX !== null && (
          <ControlFlowItem>
            <InkPicker
              bounds={{ x: inkX, y: 0, width: 30, height: 32 }}
              value={editor.ink}
              onValueChange={editor.setInk}
              shared={editor.shareInk}
              onSharedChange={editor.setShareInk}
            />
          </ControlFlowItem>
        )}
        {opacityLabelX !== null && opacityX !== null && (
          <ControlFlowItem
            bounds={{
              x: opacityLabelX,
              y: 0,
              width: opacityX + opacityWidth - opacityLabelX,
              height: 32,
            }}
          >
            <Label
              bounds={{
                x: opacityLabelX,
                y: 10,
                width: opacityLabelWidth,
                height: 14,
              }}
              text="Opacity:"
              font="mini"
            />
            <Slider
              variant={SliderVariant.Entry}
              bounds={{ x: opacityX, y: 0, width: opacityWidth, height: 32 }}
              value={editor.inkOpacity}
              min={0}
              max={UINT8_MAX}
              valueFormat="percentage"
              aria-label="Ink opacity"
              tooltip="Opacity (paint intensity)"
              onValueChange={editor.setInkOpacity}
            />
          </ControlFlowItem>
        )}
        {shadeX !== null && (
          <ControlFlowItem
            bounds={{ x: shadeX, y: 0, width: editorShadeStripWidth(editor.inkShade), height: 32 }}
          >
            <EditorShadeStrip
              origin={{ x: shadeX, y: 0 }}
              height={32}
              colors={editor.inkShade}
              onColorsChange={editor.setInkShade}
            />
          </ControlFlowItem>
        )}
        {dynamicsX !== null &&
          (editor.functional && !["pencil", "eraser", "blur"].includes(editor.tool) ? (
            <ControlFlowItem>
              <Button
                tintDisabledIcon
                bounds={{ x: dynamicsX, y: 0, width: 30, height: 32 }}
                icon="dynamics"
                iconOffset={{ x: 2, y: 0 }}
                aria-label="Dynamics"
                disabled
              />
            </ControlFlowItem>
          ) : (
            <ControlFlowItem>
              <DynamicsPicker
                bounds={{ x: dynamicsX, y: 0, width: 30, height: 32 }}
                value={editor.dynamics}
                onValueChange={editor.setDynamics}
                shared={editor.sharedDynamics}
                onSharedChange={editor.setSharedDynamics}
                brushSize={editor.brushSize}
                onBrushSizeChange={editor.setBrushSize}
                brushAngle={editor.brushAngle}
                onBrushAngleChange={editor.setBrushAngle}
                showOptionsGrid={capabilities.controls.dynamicsOptionsGrid}
              />
            </ControlFlowItem>
          ))}
        {sprayX !== null && (
          <>
            <ControlFlowItem>
              <Label
                bounds={{ x: sprayX, y: 10, width: sprayLabelWidth, height: 14 }}
                text="Spray:"
                font="mini"
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Slider
                variant={SliderVariant.Entry}
                bounds={{
                  x: sprayX + sprayLabelWidth + 8,
                  y: 0,
                  width: sprayWidthWidth,
                  height: 32,
                }}
                value={editor.sprayWidth}
                min={1}
                max={32}
                aria-label="Spray Width"
                tooltip="Spray Width"
                onValueChange={editor.setSprayWidth}
              />
            </ControlFlowItem>
            <ControlFlowItem>
              <Slider
                variant={SliderVariant.Entry}
                bounds={{
                  x: sprayX + sprayLabelWidth + 16 + sprayWidthWidth,
                  y: 0,
                  width: spraySpeedWidth,
                  height: 32,
                }}
                value={editor.spraySpeed}
                min={1}
                max={100}
                aria-label="Spray Speed"
                tooltip="Spray Speed"
                onValueChange={editor.setSpraySpeed}
              />
            </ControlFlowItem>
          </>
        )}
        {editor.symmetry.enabled &&
          (isSelection ||
            capabilities.settings.hasInk ||
            editor.tool === "blur" ||
            editor.tool === "jumble" ||
            isGradient) && (
            <ControlFlowItem>
              <SymmetryControls
                bounds={{ x: symmetryX, y: 0, width: 142, height: 32 }}
                mode={editor.symmetry.mode}
                onModeChange={editor.setSymmetryMode}
                onResetCenter={editor.resetSymmetryAxes}
                onResetViewCenter={editor.resetSymmetryToViewCenter}
              />
            </ControlFlowItem>
          )}
        {pixelX !== null && (
          <ControlFlowItem>
            <Checkbox
              bounds={{
                x: pixelX - 4,
                y: 0,
                width: checkboxSize(translateSource("Pixel-perfect"), false).width,
                height: 32,
              }}
              label="Pixel-perfect"
              disabled={!editor.pixelPerfectSupported}
              mini
              checked={editor.pixelPerfect}
              onCheckedChange={editor.setPixelPerfect}
              onCommitted={releaseEditorFocus}
            />
          </ControlFlowItem>
        )}
      </ControlFlow>
    </div>
  );
}
