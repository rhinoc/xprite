import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { tUi } from "$/i18n";
import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";
import {
  initialNormalMapFrameScope,
  isPixelBufferTransparent,
  NORMAL_FRAME_TAG_PREFIX,
  NormalMapFrameScope,
  pickNormalMapPreviewFrame,
  resolveNormalMapFrames,
  resolveSelectedTimelineFrames,
  runNormalMapBatch,
  type NormalMapBatchFrameResult,
} from "$/managers/normal-maps/normal-map-batch";
import {
  finishNormalMapAngleEstimate,
  patchNormalMapDraft,
  type NormalMapDraft,
} from "$/managers/normal-maps/normal-map-draft";
import {
  resolveNormalMapSourceDocument,
  type NormalMapRealDocumentRecord,
} from "$/managers/normal-maps/normal-map-source";
import { useNormalMapProcessorFactory } from "$/managers/normal-maps/processing-context";
import type { NormalLightingScene } from "$/managers/normal-maps/use-normal-map-light-surface";
import { useProcessedPixels } from "$/managers/normal-maps/use-processed-pixels";
import { NormalMapProcessingOperation } from "$/managers/ports/normal-map-processing";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { UINT8_MAX, type PixelBuffer } from "@xprite/editor-core/base";
import {
  canStoreNormalMapLayer,
  createNormalMapProject,
  DEFAULT_NORMAL_LAYER_NAME,
  DEFAULT_LIGHT_MASK_LAYER_NAME,
  LIGHT_MASK_LIMITS,
  type LightMaskOptions,
  DEFAULT_NORMAL_SOURCE_LAYER_NAME,
  defaultNormalMapOptions,
  defaultNormalMapLightOptions,
  normalMapSourcePixels,
  NormalMapPreset,
  NORMAL_MAP_LIMITS,
  NORMAL_LIGHT_LIMITS,
  NormalMapDocumentError,
  NormalMapDocumentErrorCode,
  type NormalMapOptions,
} from "@xprite/editor-core/image-editing";
import { LAYER_REFERENCE, MAX_TIMELINE_LAYERS, timelineTags } from "@xprite/editor-core/timeline";

export {
  NormalMapPreset as NormalPreset,
  NORMAL_MAP_LIMITS as NORMAL_GENERATOR_LIMITS,
  NORMAL_LIGHT_LIMITS,
  LIGHT_MASK_LIMITS,
};
export type NormalPreviewPixels = PixelBuffer;
const NORMAL_VISIBLE_SOURCE = "@visible";
const PAINTED_LIGHT_FROM_SOURCE = "@source";
const NORMAL_FLAT_SOURCE = "@flat";
const LIGHT_MASK_LAYER_NAME = /(?:^|[ _-])light[ _-]mask$/i;
const MASK_OUTPUT_PREFIX = "mask:";
const NORMAL_LAYER_NAME = /(^normal(?: map)?$|[ _-]normal(?:s| map)?$|_n$)/i;
const BATCH_PROGRESS_DELAY_MS = 150;
export enum NormalPreviewView {
  Original = "original",
  Normal = "normal",
  Light = "light",
}

const EMPTY_SOURCE: { pixels: PixelBuffer | null; error: string } = { pixels: null, error: "" };
function normalMapFailureMessage(error: unknown): string {
  if (error instanceof NormalMapDocumentError) {
    switch (error.code) {
      case NormalMapDocumentErrorCode.SourceMissing:
        return tUi("normal.source.missing");
      case NormalMapDocumentErrorCode.OutputLocked:
        return tUi("normal.output.locked");
      case NormalMapDocumentErrorCode.LayerLimit:
        return tUi("normal.output.limit");
    }
  }
  return tUi("normal.processing.failed");
}
function renderSource(...args: Parameters<typeof normalMapSourcePixels>): {
  pixels: PixelBuffer | null;
  error: string;
} {
  try {
    return { pixels: normalMapSourcePixels(...args), error: "" };
  } catch (error) {
    return {
      pixels: null,
      error: normalMapFailureMessage(error),
    };
  }
}

/** Coordinates detached source snapshots, generated-layer identity and live previews for the active editor. */
export function useNormalMapManager(enabled: boolean) {
  const source = useDialogEditorSource();
  const { workspace } = useEditorRuntimeManagerContext();
  const createProcessor = useNormalMapProcessorFactory();
  const [target, setTarget] = useState<DialogEditorTarget | null>(null);
  const [generatingMask, setGeneratingMask] = useState(false);
  const [maskOptions, setMaskOptions] = useState(() => workspace.normalMapPreferences.maskOptions);
  const [maskId, setMaskId] = useState(NORMAL_FLAT_SOURCE);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceId, setSourceId] = useState(NORMAL_VISIBLE_SOURCE);
  const [shadingSourceId, setShadingSourceId] = useState(PAINTED_LIGHT_FROM_SOURCE);
  const [diffuseId, setDiffuseId] = useState(NORMAL_VISIBLE_SOURCE);
  const [normalId, setNormalId] = useState(NORMAL_FLAT_SOURCE);
  const [frameScope, setFrameScopeState] = useState<string>(
    () => workspace.normalMapPreferences.frameScope,
  );
  const [selectedFramesSnapshot, setSelectedFramesSnapshot] = useState<number[]>([]);
  const [previewFrameState, setPreviewFrameState] = useState(0);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [batchProgressVisible, setBatchProgressVisible] = useState(false);
  const batchController = useRef<{ abort(): void } | null>(null);
  const batchRunning = batchProgress !== null;
  const [draft, setDraft] = useState<NormalMapDraft>(() => ({
    options: workspace.normalMapPreferences.options,
    manualAngle: workspace.normalMapPreferences.hasManualPaintedLightAngle,
    estimateSource: null,
  }));
  const { options, manualAngle, estimateSource } = draft;
  const cancelAngleEstimate = () => {
    setDraft((current) =>
      current.estimateSource ? { ...current, estimateSource: null } : current,
    );
  };
  const cancelBatch = useCallback(() => {
    batchController.current?.abort();
  }, []);
  const [view, setView] = useState(NormalPreviewView.Normal);
  const [light, setLight] = useState(() => defaultNormalMapLightOptions(1, 1));
  const [delightOn, setDelightOn] = useState(true);
  const [applyError, setApplyError] = useState("");
  const [appliedRevision, setAppliedRevision] = useState<number | null>(null);
  const associations = useRef(
    new WeakMap<object, { documentKey: string | number | null; layers: Map<string, string> }>(),
  );
  let association = source.core ? associations.current.get(source.core) : undefined;
  if (source.core && (!association || association.documentKey !== source.documentKey)) {
    association = { documentKey: source.documentKey, layers: new Map() };
    associations.current.set(source.core, association);
  }
  const outputs = association?.layers ?? new Map<string, string>();
  const lastRealSource = useRef<NormalMapRealDocumentRecord | null>(null);
  const resolvedSource = resolveNormalMapSourceDocument(
    source.core,
    source.snapshot,
    source.owner,
    source.documentKey,
    lastRealSource.current,
  );
  lastRealSource.current = resolvedSource.realRecord;
  const document = resolvedSource.document;
  const pixelRevision = resolvedSource.pixelRevision;
  const timeline = document?.timeline;
  const frame = timeline?.activeFrame ?? 0;
  const frameCount = timeline?.frames.length ?? 1;
  const revision = source.core?.getContentRevision() ?? 0;
  const generationOpen = enabled && !!target && source.isCurrentTarget(target);
  const lightingOpen = enabled && previewOpen && !!document;
  const layers = timeline?.layers ?? [];
  const tags = useMemo(
    () =>
      timeline
        ? timelineTags(timeline).map((tag) => ({ name: tag.name, from: tag.from, to: tag.to }))
        : [],
    [timeline],
  );
  const validSelectedFrames = useMemo(
    () => selectedFramesSnapshot.filter((index) => index >= 0 && index < frameCount),
    [selectedFramesSnapshot, frameCount],
  );
  const effectiveFrameScope = useMemo(() => {
    if (frameCount <= 1) return NormalMapFrameScope.Current;
    if (frameScope === NormalMapFrameScope.Selected && validSelectedFrames.length === 0)
      return workspace.normalMapPreferences.frameScope;
    if (
      frameScope.startsWith(NORMAL_FRAME_TAG_PREFIX) &&
      !tags.some((tag) => `${NORMAL_FRAME_TAG_PREFIX}${tag.name}` === frameScope)
    )
      return NormalMapFrameScope.Current;
    return frameScope;
  }, [frameCount, frameScope, validSelectedFrames.length, tags, workspace.normalMapPreferences]);
  const targetFrames = useMemo(
    () => resolveNormalMapFrames(effectiveFrameScope, frameCount, frame, validSelectedFrames, tags),
    [effectiveFrameScope, frameCount, frame, validSelectedFrames, tags],
  );
  const previewFrame = useMemo(
    () => pickNormalMapPreviewFrame(targetFrames, previewFrameState, frame),
    [targetFrames, previewFrameState, frame],
  );
  const previewFramePosition = Math.max(0, targetFrames.indexOf(previewFrame));
  const outputKey = generatingMask ? MASK_OUTPUT_PREFIX + sourceId : sourceId;
  const textureLayerIds = layers
    .filter(
      (layer) =>
        layer.kind !== "group" &&
        (NORMAL_LAYER_NAME.test(layer.name) || LIGHT_MASK_LAYER_NAME.test(layer.name)),
    )
    .map((layer) => layer.id);
  const excludedIds = [
    ...new Set([
      ...textureLayerIds,
      ...outputs.values(),
      ...(normalId !== NORMAL_FLAT_SOURCE ? [normalId] : []),
      ...(maskId !== NORMAL_FLAT_SOURCE ? [maskId] : []),
    ]),
  ];
  const excludedKey = excludedIds.join("\n");
  const layerKey = layers
    .map(
      (layer) =>
        `${layer.id}:${layer.visible}:${layer.opacity}:${layer.parentId}:${layer.blendMode}`,
    )
    .join("\n");
  const sourceAvailable =
    sourceId === NORMAL_VISIBLE_SOURCE || layers.some((layer) => layer.id === sourceId);
  useEffect(() => () => batchController.current?.abort(), []);
  useEffect(() => {
    batchController.current?.abort();
    setTarget(null);
    setApplyError("");
    setAppliedRevision(null);
    setSourceId(NORMAL_VISIBLE_SOURCE);
    setShadingSourceId(PAINTED_LIGHT_FROM_SOURCE);
    setDiffuseId(NORMAL_VISIBLE_SOURCE);
    const current = document;
    const candidate = current?.timeline?.layers.find((layer) => NORMAL_LAYER_NAME.test(layer.name));
    setNormalId(candidate?.id ?? NORMAL_FLAT_SOURCE);
    const mask = current?.timeline?.layers.find((layer) => LIGHT_MASK_LAYER_NAME.test(layer.name));
    setMaskId(mask?.id ?? NORMAL_FLAT_SOURCE);
    setLight((value) => ({
      ...defaultNormalMapLightOptions(current?.width ?? 1, current?.height ?? 1),
      invertY: value.invertY,
    }));
  }, [source.owner, source.documentKey]);
  useEffect(() => {
    if (!enabled) {
      batchController.current?.abort();
      setTarget(null);
      setPreviewOpen(false);
    }
  }, [enabled]);
  // Layer deletions invalidate references instead of silently switching the generation source.
  useEffect(() => {
    if (normalId !== NORMAL_FLAT_SOURCE && !layers.some((layer) => layer.id === normalId))
      setNormalId(NORMAL_FLAT_SOURCE);
    if (diffuseId !== NORMAL_VISIBLE_SOURCE && !layers.some((layer) => layer.id === diffuseId))
      setDiffuseId(NORMAL_VISIBLE_SOURCE);
    if (maskId !== NORMAL_FLAT_SOURCE && !layers.some((layer) => layer.id === maskId))
      setMaskId(NORMAL_FLAT_SOURCE);
  }, [layerKey, normalId, diffuseId, maskId]);
  const generationSource = useMemo(() => {
    if (!generationOpen || !document || !sourceAvailable) return EMPTY_SOURCE;
    return renderSource(
      document,
      previewFrame,
      sourceId === NORMAL_VISIBLE_SOURCE ? null : sourceId,
      excludedIds,
    );
  }, [
    generationOpen,
    source.owner,
    source.documentKey,
    pixelRevision,
    layerKey,
    previewFrame,
    sourceId,
    sourceAvailable,
    excludedKey,
  ]);
  const useShadingLayer =
    generationOpen &&
    !generatingMask &&
    options.paintedLightInfluence > 0 &&
    shadingSourceId !== PAINTED_LIGHT_FROM_SOURCE;
  const shadingSource = useMemo(() => {
    if (!useShadingLayer || !document) return EMPTY_SOURCE;
    if (excludedIds.includes(shadingSourceId))
      return { pixels: null, error: tUi("normal.source.missing") };
    return renderSource(document, previewFrame, shadingSourceId, excludedIds);
  }, [
    useShadingLayer,
    shadingSourceId,
    source.owner,
    source.documentKey,
    pixelRevision,
    layerKey,
    previewFrame,
    excludedKey,
  ]);
  const suggestPaintedLightAngle =
    generationOpen &&
    !generatingMask &&
    !!estimateSource &&
    estimateSource === generationSource.pixels &&
    !shadingSource.error;
  const input = useMemo(() => {
    const pixels = generationSource.pixels;
    if (!pixels || shadingSource.error) return null;
    return generatingMask
      ? ({
          operation: NormalMapProcessingOperation.GenerateMask,
          source: pixels,
          options: maskOptions,
        } as const)
      : ({
          operation: NormalMapProcessingOperation.Generate,
          source: pixels,
          shading: shadingSource.pixels,
          options,
          suggestPaintedLightAngle,
        } as const);
  }, [
    generationSource.pixels,
    shadingSource,
    generatingMask,
    maskOptions,
    options,
    suggestPaintedLightAngle,
  ]);
  const generated = useProcessedPixels(input, generationOpen, source.owner);
  useEffect(() => {
    if (
      !estimateSource ||
      (suggestPaintedLightAngle && generated.suggestedPaintedLightAngle === undefined)
    )
      return;
    const stillCurrent =
      suggestPaintedLightAngle &&
      target &&
      source.isCurrentTarget(target) &&
      source.core?.getContentRevision() === revision;
    setDraft((current) =>
      finishNormalMapAngleEstimate(
        current,
        estimateSource,
        stillCurrent ? (generated.suggestedPaintedLightAngle ?? null) : null,
      ),
    );
  }, [
    estimateSource,
    suggestPaintedLightAngle,
    generated.suggestedPaintedLightAngle,
    target,
    source.owner,
    source.documentKey,
    revision,
    previewFrame,
  ]);
  const diffuse = useMemo(() => {
    if (!lightingOpen || !document) return EMPTY_SOURCE;
    return renderSource(
      document,
      frame,
      diffuseId === NORMAL_VISIBLE_SOURCE ? null : diffuseId,
      excludedIds,
    );
  }, [
    lightingOpen,
    source.owner,
    source.documentKey,
    pixelRevision,
    layerKey,
    frame,
    diffuseId,
    excludedKey,
  ]);
  const normals = useMemo(() => {
    if (!lightingOpen || !document || normalId === NORMAL_FLAT_SOURCE) return EMPTY_SOURCE;
    return renderSource(document, frame, normalId, [], false);
  }, [lightingOpen, source.owner, source.documentKey, pixelRevision, layerKey, frame, normalId]);
  const mask = useMemo(() => {
    if (!lightingOpen || !document || maskId === NORMAL_FLAT_SOURCE) return EMPTY_SOURCE;
    return renderSource(document, frame, maskId, [], false);
  }, [lightingOpen, source.owner, source.documentKey, pixelRevision, layerKey, frame, maskId]);
  const generationNormals = useMemo(() => {
    if (!generationOpen || !generatingMask || !document || normalId === NORMAL_FLAT_SOURCE)
      return EMPTY_SOURCE;
    return renderSource(document, previewFrame, normalId, [], false);
  }, [
    generationOpen,
    generatingMask,
    source.owner,
    source.documentKey,
    pixelRevision,
    layerKey,
    previewFrame,
    normalId,
  ]);
  const generationMask = useMemo(() => {
    if (!generationOpen || generatingMask || !document || maskId === NORMAL_FLAT_SOURCE)
      return EMPTY_SOURCE;
    return renderSource(document, previewFrame, maskId, [], false);
  }, [
    generationOpen,
    generatingMask,
    source.owner,
    source.documentKey,
    pixelRevision,
    layerKey,
    previewFrame,
    maskId,
  ]);
  // During generation, the same light controls can inspect the detached candidate without committing it.
  const albedo = generationOpen ? (input?.source ?? null) : diffuse.pixels;
  const previewNormals = generatingMask ? generationNormals.pixels : generated.displayPixels;
  const previewMask = generatingMask ? generated.displayPixels : generationMask.pixels;
  // Painted-light removal mirrors the generation settings: the same angle and
  // influence divide the shading already baked into the albedo before relighting.
  const delight =
    delightOn && !generatingMask && options.paintedLightInfluence > 0
      ? { angle: options.paintedLightAngle, influence: options.paintedLightInfluence }
      : undefined;
  const generationLighting = useMemo<NormalLightingScene | null>(
    () =>
      albedo
        ? {
            source: albedo,
            normals: previewNormals,
            mask: previewMask,
            options: {
              ...light,
              invertY: generatingMask ? light.invertY : generated.displayInvertY,
              maskStrength: generatingMask ? NORMAL_LIGHT_LIMITS.maskStrength : light.maskStrength,
              delight,
            },
            identity: source.owner,
          }
        : null,
    [
      albedo,
      previewNormals,
      previewMask,
      light,
      generatingMask,
      generated.displayInvertY,
      delight,
      source.owner,
    ],
  );
  const lightingScene = useMemo<NormalLightingScene | null>(
    () =>
      diffuse.pixels
        ? {
            source: diffuse.pixels,
            normals: normals.pixels,
            mask: mask.pixels,
            options: { ...light, delight },
            identity: source.owner,
          }
        : null,
    [diffuse.pixels, normals.pixels, mask.pixels, light, delight, source.owner],
  );
  const apply = useCallback(
    async (closeOnSuccess = false) => {
      if (
        batchController.current ||
        suggestPaintedLightAngle ||
        !target ||
        !source.isCurrentTarget(target) ||
        !source.core ||
        !generated.pixels ||
        !input ||
        !targetFrames.length
      )
        return false;
      // The source/parameters must still be exactly the candidate shown to the user.
      if (source.core.getContentRevision() !== revision || appliedRevision === revision)
        return false;
      const activeCore = source.core;
      const startTarget = target;
      const startRevision = revision;
      const currentDocument = activeCore.getSnapshot().document;
      if (!currentDocument?.timeline) return false;
      const framesToProcess = [...targetFrames];
      const capturedSourceId = sourceId;
      const capturedShadingSourceId = shadingSourceId;
      const capturedExcludedIds = [...excludedIds];
      const capturedOutputKey = outputKey;
      const capturedGeneratingMask = generatingMask;
      const capturedOptions = { ...options };
      const capturedManualAngle = manualAngle;
      const capturedMaskOptions = { ...maskOptions };
      const capturedScope = effectiveFrameScope;
      const capturedFrameCount = frameCount;
      const capturedUseShading =
        !capturedGeneratingMask &&
        capturedOptions.paintedLightInfluence > 0 &&
        capturedShadingSourceId !== PAINTED_LIGHT_FROM_SOURCE;
      const cachedPreview = {
        source: input.source,
        shading: input.operation === NormalMapProcessingOperation.Generate ? input.shading : null,
        output: generated.pixels,
      };
      const commitResults = (results: readonly NormalMapBatchFrameResult[]): boolean => {
        if (
          !source.isCurrentTarget(startTarget) ||
          activeCore.getContentRevision() !== startRevision
        )
          return false;
        const current = activeCore.getSnapshot().document!;
        const layerName = capturedGeneratingMask
          ? DEFAULT_LIGHT_MASK_LAYER_NAME
          : DEFAULT_NORMAL_LAYER_NAME;
        if (canStoreNormalMapLayer(current)) {
          const existing = outputs.get(capturedOutputKey);
          const validExisting = current.timeline?.layers.some((layer) => layer.id === existing)
            ? existing
            : undefined;
          const name =
            capturedSourceId === NORMAL_VISIBLE_SOURCE
              ? layerName
              : `${current.timeline?.layers.find((layer) => layer.id === capturedSourceId)?.name ?? ""} ${layerName}`;
          const frameOutputs = results.map(({ frame: targetFrame, pixels }) => ({
            frame: targetFrame,
            pixels,
          }));
          const id = capturedGeneratingMask
            ? activeCore.imageEditing.applyLightMask(frameOutputs, name, validExisting)
            : activeCore.imageEditing.applyNormalMap(frameOutputs, name, validExisting);
          if (!id) return false;
          outputs.set(capturedOutputKey, id);
          if (capturedGeneratingMask) setMaskId(id);
          else setNormalId(id);
          setDiffuseId(capturedSourceId);
          setAppliedRevision(activeCore.getContentRevision());
          if (closeOnSuccess) {
            cancelAngleEstimate();
            setTarget(null);
          }
        } else {
          // Keep the source mode/profile intact. The RGB result contains albedo and normals for editing/preview.
          const project = createNormalMapProject(
            results.map(({ frame: targetFrame, source: frameSource, pixels }) => ({
              source: frameSource,
              pixels,
              duration: current.timeline!.frames[targetFrame].duration,
            })),
            DEFAULT_NORMAL_SOURCE_LAYER_NAME,
            layerName,
          );
          workspace.createDocumentFromProject(
            project,
            `${current.name.replace(/\.[^.]+$/, "")}-${capturedGeneratingMask ? "light-mask" : "normal"}.aseprite`,
          );
          const result = workspace.active.core;
          if (result === activeCore) {
            setApplyError(tUi("normal.output.failed"));
            return false;
          }
          const resultDocument = result.getSnapshot().document!;
          associations.current.set(result, {
            documentKey: resultDocument.id ?? resultDocument.name,
            layers: new Map([
              [
                capturedGeneratingMask
                  ? MASK_OUTPUT_PREFIX + NORMAL_VISIBLE_SOURCE
                  : NORMAL_VISIBLE_SOURCE,
                project.timeline.layers[project.timeline.activeLayer].id,
              ],
            ]),
          });
          setTarget(null);
        }
        const rememberedScope = capturedFrameCount > 1 ? capturedScope : undefined;
        if (capturedGeneratingMask) {
          workspace.normalMapPreferences.acceptedMask(capturedMaskOptions, rememberedScope);
        } else {
          workspace.normalMapPreferences.accepted(
            capturedOptions,
            capturedManualAngle,
            rememberedScope,
          );
          setLight((value) => ({ ...value, invertY: capturedOptions.invertY }));
        }
        setPreviewOpen(true);
        setApplyError("");
        return true;
      };
      // Fast synchronous path when targeting only the already-rendered preview frame.
      if (framesToProcess.length === 1 && framesToProcess[0] === previewFrame) {
        try {
          return commitResults([
            {
              frame: previewFrame,
              source: input.source,
              pixels: isPixelBufferTransparent(input.source) ? null : generated.pixels,
            },
          ]);
        } catch (error) {
          setApplyError(normalMapFailureMessage(error));
          return false;
        }
      }
      const processor = createProcessor?.() ?? null;
      if (!processor) {
        setApplyError(tUi("normal.processing.failed"));
        return false;
      }
      const abortController = new AbortController();
      batchController.current = {
        abort: () => {
          abortController.abort();
          processor.dispose();
        },
      };
      setApplyError("");
      setBatchProgress({ completed: 0, total: framesToProcess.length });
      setBatchProgressVisible(false);
      const progressTimer = setTimeout(() => {
        if (!abortController.signal.aborted) setBatchProgressVisible(true);
      }, BATCH_PROGRESS_DELAY_MS);
      try {
        const results = await runNormalMapBatch({
          frames: framesToProcess,
          cachedPreview,
          signal: abortController.signal,
          renderFrame: (targetFrame) => {
            const renderedSource = normalMapSourcePixels(
              currentDocument,
              targetFrame,
              capturedSourceId === NORMAL_VISIBLE_SOURCE ? null : capturedSourceId,
              capturedExcludedIds,
            );
            const renderedShading = capturedUseShading
              ? normalMapSourcePixels(
                  currentDocument,
                  targetFrame,
                  capturedShadingSourceId,
                  capturedExcludedIds,
                )
              : null;
            return { source: renderedSource, shading: renderedShading };
          },
          processFrame: async (frameSource, frameShading) => {
            const result = await processor.process(
              capturedGeneratingMask
                ? {
                    operation: NormalMapProcessingOperation.GenerateMask,
                    source: frameSource,
                    options: capturedMaskOptions,
                  }
                : {
                    operation: NormalMapProcessingOperation.Generate,
                    source: frameSource,
                    shading: frameShading,
                    options: capturedOptions,
                    suggestPaintedLightAngle: false,
                  },
            );
            return result.pixels;
          },
          onProgress: (completed, total) => {
            if (!abortController.signal.aborted) setBatchProgress({ completed, total });
          },
        });
        if (abortController.signal.aborted) return false;
        return commitResults(results);
      } catch (error) {
        if (
          abortController.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return false;
        setApplyError(normalMapFailureMessage(error));
        return false;
      } finally {
        clearTimeout(progressTimer);
        processor.dispose();
        batchController.current = null;
        setBatchProgress(null);
        setBatchProgressVisible(false);
      }
    },
    [
      target,
      source.owner,
      source.documentKey,
      generated.pixels,
      input,
      revision,
      appliedRevision,
      sourceId,
      shadingSourceId,
      excludedKey,
      previewFrame,
      targetFrames,
      effectiveFrameScope,
      frameCount,
      outputKey,
      generatingMask,
      maskOptions,
      workspace,
      options,
      manualAngle,
      suggestPaintedLightAngle,
      createProcessor,
    ],
  );
  const choices = layers
    .filter((layer) => !(layer.flags & LAYER_REFERENCE))
    .map((layer) => ({
      value: layer.id,
      label: layer.name,
      translateLabel: false,
    }));
  const frameScopeChoices = useMemo(
    () => [
      {
        value: NormalMapFrameScope.All,
        label: tUi("normal.frames.all", { value1: frameCount }),
        translateLabel: false,
      },
      {
        value: NormalMapFrameScope.Selected,
        label:
          validSelectedFrames.length > 0
            ? tUi("normal.frames.selected", { value1: validSelectedFrames.length })
            : tUi("normal.frames.selectedEmpty"),
        disabled: validSelectedFrames.length === 0,
        translateLabel: false,
      },
      {
        value: NormalMapFrameScope.Current,
        label: tUi("normal.frames.current", { value1: frame + 1 }),
        translateLabel: false,
      },
      ...tags.map((tag) => {
        const from = Math.max(0, Math.min(frameCount - 1, tag.from));
        const to = Math.max(from, Math.min(frameCount - 1, tag.to));
        return {
          value: `${NORMAL_FRAME_TAG_PREFIX}${tag.name}`,
          label: tUi("normal.frames.tag", { value1: tag.name, value2: to - from + 1 }),
          translateLabel: false,
        };
      }),
    ],
    [frameCount, validSelectedFrames.length, frame, tags],
  );
  const targetLayer = outputs.get(outputKey);
  const sourceLayerChoices = choices.filter((choice) => !excludedIds.includes(choice.value));
  const hasRoom =
    !document ||
    !canStoreNormalMapLayer(document) ||
    (!!targetLayer && layers.some((layer) => layer.id === targetLayer)) ||
    layers.length < MAX_TIMELINE_LAYERS;
  return {
    generationOpen,
    generatingMask,
    maskOptions,
    maskId,
    hasMask: maskId !== NORMAL_FLAT_SOURCE,
    lightingOpen,
    options,
    sourceId,
    shadingSourceId,
    diffuseId,
    normalId,
    frameScope: effectiveFrameScope,
    frameScopeChoices,
    showFrameScope: frameCount > 1,
    targetFrameCount: targetFrames.length,
    previewFrame,
    previewFrameIndex: previewFramePosition,
    batchRunning,
    batchProgress: batchProgressVisible ? batchProgress : null,
    view,
    light,
    delightOn,
    sourceChoices: [
      { value: NORMAL_VISIBLE_SOURCE, label: tUi("normal.source.visible") },
      ...sourceLayerChoices,
    ],
    shadingSourceChoices: [
      { value: PAINTED_LIGHT_FROM_SOURCE, label: tUi("normal.painted.fromSource") },
      ...sourceLayerChoices,
    ],
    diffuseChoices: [
      { value: NORMAL_VISIBLE_SOURCE, label: tUi("normal.source.visible") },
      ...choices,
    ],
    normalChoices: [{ value: NORMAL_FLAT_SOURCE, label: tUi("normal.source.none") }, ...choices],
    maskChoices: [{ value: NORMAL_FLAT_SOURCE, label: tUi("normal.source.none") }, ...choices],
    setMaskId,
    canOpen: enabled && !!document,
    canApply:
      !batchRunning &&
      !!generated.pixels &&
      !generated.busy &&
      !suggestPaintedLightAngle &&
      hasRoom &&
      appliedRevision !== revision,
    // Moving the light refreshes only its image; it must not toggle the generation form's status/actions.
    generating: generated.busy || (suggestPaintedLightAngle && !generated.error),
    error:
      applyError ||
      (generationOpen
        ? generationSource.error || shadingSource.error
        : diffuse.error || normals.error || mask.error) ||
      generated.error ||
      (!sourceAvailable
        ? tUi("normal.source.missing")
        : !hasRoom
          ? tUi("normal.output.limit")
          : ""),
    generationPixels: view === NormalPreviewView.Normal ? generated.displayPixels : albedo,
    generationLighting,
    lightingScene,
    dimensions: { width: document?.width ?? 1, height: document?.height ?? 1 },
    openGeneration(mask = false) {
      if (!enabled || !source.core?.imageEditing.beginNormalMap()) return;
      batchController.current?.abort();
      const currentTimeline = source.core.getSnapshot().document?.timeline;
      const currentFrameCount = currentTimeline?.frames.length ?? 1;
      const currentActiveFrame = currentTimeline?.activeFrame ?? 0;
      const selected = resolveSelectedTimelineFrames(currentTimeline);
      const initialScope = initialNormalMapFrameScope(
        currentFrameCount,
        selected,
        workspace.normalMapPreferences.frameScope,
      );
      const currentTags = currentTimeline
        ? timelineTags(currentTimeline).map((tag) => ({
            name: tag.name,
            from: tag.from,
            to: tag.to,
          }))
        : [];
      const initialFrames = resolveNormalMapFrames(
        initialScope,
        currentFrameCount,
        currentActiveFrame,
        selected,
        currentTags,
      );
      setGeneratingMask(mask);
      setSelectedFramesSnapshot(selected);
      setFrameScopeState(initialScope);
      setPreviewFrameState(
        pickNormalMapPreviewFrame(initialFrames, currentActiveFrame, currentActiveFrame),
      );
      setDraft({
        options: workspace.normalMapPreferences.options,
        manualAngle: workspace.normalMapPreferences.hasManualPaintedLightAngle,
        estimateSource: null,
      });
      setMaskOptions(workspace.normalMapPreferences.maskOptions);
      setAppliedRevision(null);
      setApplyError("");
      setTarget(source.target);
    },
    closeGeneration: () => {
      batchController.current?.abort();
      cancelAngleEstimate();
      setTarget(null);
      setApplyError("");
    },
    cancelBatch,
    setFrameScope: (value: string) => {
      cancelAngleEstimate();
      setFrameScopeState(value);
      const nextFrames = resolveNormalMapFrames(
        value,
        frameCount,
        frame,
        validSelectedFrames,
        tags,
      );
      setPreviewFrameState((current) => pickNormalMapPreviewFrame(nextFrames, current, frame));
      setAppliedRevision(null);
      setApplyError("");
    },
    stepPreviewFrame: (delta: number) => {
      if (targetFrames.length <= 1) return;
      cancelAngleEstimate();
      const nextIndex = (previewFramePosition + delta + targetFrames.length) % targetFrames.length;
      setPreviewFrameState(targetFrames[nextIndex]);
    },
    openLighting: () => {
      if (enabled && document) setPreviewOpen(true);
    },
    closeLighting: () => setPreviewOpen(false),
    setSourceId: (value: string) => {
      cancelAngleEstimate();
      setSourceId(value);
      setAppliedRevision(null);
      setApplyError("");
    },
    setShadingSourceId(value: string) {
      cancelAngleEstimate();
      setShadingSourceId(value);
      setAppliedRevision(null);
      setApplyError("");
    },
    setDiffuseId,
    setNormalId,
    setView,
    setOptions: (value: Partial<NormalMapOptions>) => {
      setDraft((current) =>
        patchNormalMapDraft(
          current,
          value,
          generationOpen && !generatingMask ? generationSource.pixels : null,
        ),
      );
      setAppliedRevision(null);
    },
    setMaskOptions(value: LightMaskOptions) {
      setMaskOptions(value);
      setAppliedRevision(null);
    },
    selectPreset(preset: NormalMapPreset) {
      setDraft((current) => ({
        ...current,
        options: {
          ...defaultNormalMapOptions(preset),
          invertY: current.options.invertY,
          paintedLightAngle: current.options.paintedLightAngle,
          paintedLightInfluence: current.options.paintedLightInfluence,
        },
      }));
      setAppliedRevision(null);
    },
    setLight,
    setDelightOn,
    setLightColor(color: string) {
      const values = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
      if (values)
        setLight((value) => ({
          ...value,
          color: [
            parseInt(values[1], 16),
            parseInt(values[2], 16),
            parseInt(values[3], 16),
            UINT8_MAX,
          ],
        }));
    },
    apply,
  };
}
export type NormalMapManager = ReturnType<typeof useNormalMapManager>;
