import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { tUi } from "$/i18n";
import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";
import type { NormalLightingScene } from "$/managers/normal-maps/use-normal-map-light-surface";
import { useProcessedPixels } from "$/managers/normal-maps/use-processed-pixels";
import { NormalMapProcessingOperation } from "$/managers/ports/normal-map-processing";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { UINT8_MAX, type PixelBuffer } from "@xprite/editor-core/base";
import {
  canStoreNormalMapLayer,
  createNormalMapProject,
  DEFAULT_NORMAL_LAYER_NAME,
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
import { LAYER_REFERENCE, MAX_TIMELINE_LAYERS } from "@xprite/editor-core/timeline";

export {
  NormalMapPreset as NormalPreset,
  NORMAL_MAP_LIMITS as NORMAL_GENERATOR_LIMITS,
  NORMAL_LIGHT_LIMITS,
};
export type NormalGeneratorOptions = NormalMapOptions;
export type NormalPreviewPixels = PixelBuffer;
const NORMAL_VISIBLE_SOURCE = "@visible";
const NORMAL_FLAT_SOURCE = "@flat";
const NORMAL_LAYER_NAME = /(^normal(?: map)?$|[ _-]normal(?:s| map)?$|_n$)/i;
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
  const [target, setTarget] = useState<DialogEditorTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceId, setSourceId] = useState(NORMAL_VISIBLE_SOURCE);
  const [diffuseId, setDiffuseId] = useState(NORMAL_VISIBLE_SOURCE);
  const [normalId, setNormalId] = useState(NORMAL_FLAT_SOURCE);
  const [options, setOptions] = useState<NormalMapOptions>(
    () => workspace.normalMapPreferences.options,
  );
  const [view, setView] = useState(NormalPreviewView.Normal);
  const [light, setLight] = useState(() => defaultNormalMapLightOptions(1, 1));
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
  const snapshot = source.snapshot;
  const document = source.document;
  const timeline = document?.timeline;
  const frame = timeline?.activeFrame ?? 0;
  const revision = source.core?.getContentRevision() ?? 0;
  const generationOpen = enabled && !!target && source.isCurrentTarget(target);
  const lightingOpen = enabled && previewOpen && !!document;
  const layers = timeline?.layers ?? [];
  const namedNormals = layers
    .filter((layer) => layer.kind !== "group" && NORMAL_LAYER_NAME.test(layer.name))
    .map((layer) => layer.id);
  const excludedIds = [
    ...new Set([
      ...namedNormals,
      ...outputs.values(),
      ...(normalId !== NORMAL_FLAT_SOURCE ? [normalId] : []),
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
  useEffect(() => {
    setTarget(null);
    setApplyError("");
    setAppliedRevision(null);
    setSourceId(NORMAL_VISIBLE_SOURCE);
    setDiffuseId(NORMAL_VISIBLE_SOURCE);
    const current = source.core?.getSnapshot().document;
    const candidate = current?.timeline?.layers.find((layer) => NORMAL_LAYER_NAME.test(layer.name));
    setNormalId(candidate?.id ?? NORMAL_FLAT_SOURCE);
    setLight((value) => ({
      ...defaultNormalMapLightOptions(current?.width ?? 1, current?.height ?? 1),
      invertY: value.invertY,
    }));
  }, [source.owner, source.documentKey]);
  useEffect(() => {
    if (!enabled) {
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
  }, [layerKey, normalId, diffuseId]);
  const generationSource = useMemo(() => {
    if (!generationOpen || !document || !sourceAvailable) return EMPTY_SOURCE;
    return renderSource(
      document,
      frame,
      sourceId === NORMAL_VISIBLE_SOURCE ? null : sourceId,
      excludedIds,
    );
  }, [
    generationOpen,
    source.owner,
    source.documentKey,
    snapshot?.pixelRevision,
    layerKey,
    frame,
    sourceId,
    sourceAvailable,
    excludedKey,
  ]);
  const input = useMemo(
    () =>
      generationSource.pixels
        ? ({
            operation: NormalMapProcessingOperation.Generate,
            source: generationSource.pixels,
            options,
          } as const)
        : null,
    [generationSource.pixels, options],
  );
  const generated = useProcessedPixels(input, generationOpen, source.owner);
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
    snapshot?.pixelRevision,
    layerKey,
    frame,
    diffuseId,
    excludedKey,
  ]);
  const normals = useMemo(() => {
    if (!lightingOpen || !document || normalId === NORMAL_FLAT_SOURCE) return EMPTY_SOURCE;
    return renderSource(document, frame, normalId, [], false);
  }, [
    lightingOpen,
    source.owner,
    source.documentKey,
    snapshot?.pixelRevision,
    layerKey,
    frame,
    normalId,
  ]);
  // During generation, the same light controls can inspect the detached candidate without committing it.
  const albedo = generationOpen ? (input?.source ?? null) : diffuse.pixels;
  const map = generationOpen ? generated.displayPixels : normals.pixels;
  const generationLighting = useMemo<NormalLightingScene | null>(
    () =>
      albedo
        ? {
            source: albedo,
            normals: map,
            options: { ...light, invertY: generated.displayInvertY },
            identity: source.owner,
          }
        : null,
    [albedo, map, light, generated.displayInvertY, source.owner],
  );
  const lightingScene = useMemo<NormalLightingScene | null>(
    () =>
      diffuse.pixels
        ? {
            source: diffuse.pixels,
            normals: normals.pixels,
            options: light,
            identity: source.owner,
          }
        : null,
    [diffuse.pixels, normals.pixels, light, source.owner],
  );
  const apply = useCallback(() => {
    if (!target || !source.isCurrentTarget(target) || !source.core || !generated.pixels || !input)
      return false;
    // The source/parameters must still be exactly the candidate shown to the user.
    if (source.core.getContentRevision() !== revision || appliedRevision === revision) return false;
    try {
      const current = source.core.getSnapshot().document!;
      if (canStoreNormalMapLayer(current)) {
        const key = sourceId;
        const existing = outputs.get(key);
        const validExisting = current.timeline?.layers.some((layer) => layer.id === existing)
          ? existing
          : undefined;
        const name =
          sourceId === NORMAL_VISIBLE_SOURCE
            ? DEFAULT_NORMAL_LAYER_NAME
            : `${current.timeline?.layers.find((layer) => layer.id === sourceId)?.name ?? ""} ${DEFAULT_NORMAL_LAYER_NAME}`;
        const id = source.core.imageEditing.applyNormalMap(
          [{ frame, pixels: generated.pixels }],
          name,
          validExisting,
        );
        if (!id) return false;
        outputs.set(key, id);
        setNormalId(id);
        setDiffuseId(sourceId);
        setAppliedRevision(source.core.getContentRevision());
      } else {
        // Keep the source mode/profile intact. The RGB result contains albedo and normals for editing/preview.
        const project = createNormalMapProject(
          input.source,
          generated.pixels,
          DEFAULT_NORMAL_SOURCE_LAYER_NAME,
          current.timeline!.frames[frame].duration,
        );
        workspace.createDocumentFromProject(
          project,
          `${current.name.replace(/\.[^.]+$/, "")}-normal.aseprite`,
        );
        const result = workspace.active.core;
        if (result === source.core) {
          setApplyError(tUi("normal.output.failed"));
          return false;
        }
        const resultDocument = result.getSnapshot().document!;
        associations.current.set(result, {
          documentKey: resultDocument.id ?? resultDocument.name,
          layers: new Map([
            [NORMAL_VISIBLE_SOURCE, project.timeline.layers[project.timeline.activeLayer].id],
          ]),
        });
        setTarget(null);
      }
      workspace.normalMapPreferences.accepted(options);
      setLight((value) => ({ ...value, invertY: options.invertY }));
      setPreviewOpen(true);
      setApplyError("");
      return true;
    } catch (error) {
      setApplyError(normalMapFailureMessage(error));
      return false;
    }
  }, [
    target,
    source.owner,
    source.documentKey,
    generated.pixels,
    input,
    revision,
    appliedRevision,
    sourceId,
    frame,
    workspace,
    options,
  ]);
  const choices = layers
    .filter((layer) => !(layer.flags & LAYER_REFERENCE))
    .map((layer) => ({
      value: layer.id,
      label: layer.name,
      translateLabel: false,
    }));
  const targetLayer = outputs.get(sourceId);
  const hasRoom =
    !document ||
    !canStoreNormalMapLayer(document) ||
    (!!targetLayer && layers.some((layer) => layer.id === targetLayer)) ||
    layers.length < MAX_TIMELINE_LAYERS;
  return {
    generationOpen,
    lightingOpen,
    options,
    sourceId,
    diffuseId,
    normalId,
    view,
    light,
    sourceChoices: [
      { value: NORMAL_VISIBLE_SOURCE, label: tUi("normal.source.visible") },
      ...choices.filter((choice) => !excludedIds.includes(choice.value)),
    ],
    diffuseChoices: [
      { value: NORMAL_VISIBLE_SOURCE, label: tUi("normal.source.visible") },
      ...choices,
    ],
    normalChoices: [{ value: NORMAL_FLAT_SOURCE, label: tUi("normal.source.none") }, ...choices],
    canOpen: enabled && !!document,
    canApply: !!generated.pixels && !generated.busy && hasRoom && appliedRevision !== revision,
    // Moving the light refreshes only its image; it must not toggle the generation form's status/actions.
    generating: generated.busy,
    error:
      applyError ||
      (generationOpen ? generationSource.error : diffuse.error || normals.error) ||
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
    openGeneration() {
      if (!enabled || !source.core?.imageEditing.beginNormalMap()) return;
      setOptions(workspace.normalMapPreferences.options);
      setAppliedRevision(null);
      setApplyError("");
      setTarget(source.target);
    },
    closeGeneration: () => {
      setTarget(null);
      setApplyError("");
    },
    openLighting: () => {
      if (enabled && document) setPreviewOpen(true);
    },
    closeLighting: () => setPreviewOpen(false),
    setSourceId: (value: string) => {
      setSourceId(value);
      setAppliedRevision(null);
      setApplyError("");
    },
    setDiffuseId,
    setNormalId,
    setView,
    setOptions: (value: NormalMapOptions) => {
      setOptions(value);
      setAppliedRevision(null);
    },
    selectPreset(preset: NormalMapPreset) {
      setOptions({ ...defaultNormalMapOptions(preset), invertY: options.invertY });
      setAppliedRevision(null);
    },
    setLight,
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
