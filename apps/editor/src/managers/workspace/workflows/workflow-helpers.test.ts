import { describe, expect, it, vi } from "vitest";

import { ClipboardRegion } from "$/managers/clipboard";
import { InteractionBlocker } from "$/managers/ports/diagnostics";
import { TelemetryOperationOutcome } from "$/managers/ports/telemetry";
import { PreferenceResetTarget } from "$/managers/preferences/reset-preferences";
import {
  DEFAULT_SEQUENCE_FRAME_DURATION_MS,
  MAX_SEQUENCE_FRAME_DURATION_MS,
  MIN_SEQUENCE_FRAME_DURATION_MS,
} from "$/managers/workspace/file-import-plan";
import {
  computeWorkflowInteractionState,
  type WorkflowInteractionFlags,
} from "$/managers/workspace/workflows/interaction-blockers";
import { timelinePasteRejectionMessage } from "$/managers/workspace/workflows/use-clipboard-workflows";
import {
  dispatchRequestedEditorAction,
  shouldDeferNativePaste,
  shouldSkipRepeatedCommand,
  type RequestedEditorActionHandlers,
} from "$/managers/workspace/workflows/use-command-and-shortcut-workflows";
import { telemetryOutcomeForSessionOutcome } from "$/managers/workspace/workflows/use-document-save-workflows";
import {
  buildPixelationPaletteChoices,
  clampSequenceFrameDuration,
  normalizeNewSpriteBaseName,
  openClipboardImageInWorkspace,
} from "$/managers/workspace/workflows/use-file-import-workflows";
import {
  resetEditorPreferences,
  type PreferenceResetDeps,
} from "$/managers/workspace/workflows/use-preferences-and-text-workflows";
import { EffectKind, TimelinePasteRejectionReason } from "@xprite/editor-core";
import { SessionOutcome } from "@xprite/editor-core/session";
import { PalettePresetKind } from "@xprite/editor-ui/palette/model";

function idleFlags(overrides: Partial<WorkflowInteractionFlags> = {}): WorkflowInteractionFlags {
  return {
    aboutOpen: false,
    supportOpen: false,
    feedbackOpen: false,
    inputDialogOpen: false,
    newTilemapDialog: false,
    preferencesOpen: false,
    saveAsOpen: false,
    newDialog: false,
    duplicateSpriteOpen: false,
    keyboardShortcutsOpen: false,
    outputHasOpenDialog: false,
    deleteRecoveryOpen: false,
    deleteBrowserCopyOpen: false,
    sequenceImportOpen: false,
    videoImportOpen: false,
    pendingImportOpen: false,
    replacementOpen: false,
    errorOpen: false,
    exitNoticeOpen: false,
    exportBusy: false,
    saveAsBusy: false,
    recoveryBusy: false,
    closingSaveBusy: false,
    importBatchActive: false,
    sessionBusy: false,
    sessionSaving: false,
    sessionPrompt: null,
    sessionCanStartInteraction: true,
    ...overrides,
  };
}

describe("computeWorkflowInteractionState", () => {
  it("allows starting workflows and dispatching input when no blockers are active", () => {
    const state = computeWorkflowInteractionState(idleFlags());
    expect(state.modalOpen).toBe(false);
    expect(state.operationBusy).toBe(false);
    expect(state.interactionBlockers).toEqual([]);
    expect(state.canStartInteraction).toBe(true);
    expect(state.canDispatchEditorInput).toBe(true);
  });

  it("keeps ordinary editor input enabled during background saving while blocking new workflows", () => {
    const state = computeWorkflowInteractionState(
      idleFlags({ sessionSaving: true, sessionCanStartInteraction: false }),
    );
    expect(state.canStartInteraction).toBe(false);
    expect(state.canDispatchEditorInput).toBe(true);
    expect(state.interactionBlockers).toEqual([InteractionBlocker.SessionSaving]);
  });

  it("records SessionUnavailable when session cannot start interaction without explicit busy/prompt", () => {
    const state = computeWorkflowInteractionState(idleFlags({ sessionCanStartInteraction: false }));
    expect(state.interactionBlockers).toEqual([InteractionBlocker.SessionUnavailable]);
  });
});

describe("file import and palette choice helpers", () => {
  it("clamps PNG sequence frame durations and normalizes new sprite base names", () => {
    expect(clampSequenceFrameDuration(Number.NaN)).toBe(DEFAULT_SEQUENCE_FRAME_DURATION_MS);
    expect(clampSequenceFrameDuration(0)).toBe(MIN_SEQUENCE_FRAME_DURATION_MS);
    expect(clampSequenceFrameDuration(999999)).toBe(MAX_SEQUENCE_FRAME_DURATION_MS);
    expect(clampSequenceFrameDuration(125.6)).toBe(126);

    expect(normalizeNewSpriteBaseName("  hero.aseprite  ")).toBe("hero");
    expect(normalizeNewSpriteBaseName("walk.ASE")).toBe("walk");
    expect(normalizeNewSpriteBaseName("   .aseprite ")).toBe("");
  });

  it("merges and sorts builtin and saved palette presets with stable prefixes", () => {
    const choices = buildPixelationPaletteChoices(
      [{ id: "pico", name: "Zebra", colors: [[0, 0, 0, 255]], group: "Built-in", author: null }],
      [{ name: "Alpha", colors: [[255, 255, 255, 255]] }],
    );
    expect(choices.map((c) => [c.id, c.source])).toEqual([
      ["saved:alpha", PalettePresetKind.Saved],
      ["builtin:pico", PalettePresetKind.Builtin],
    ]);
  });

  it("routes clipboard image payloads with Aseprite metadata through createDocumentFromProject", () => {
    const createDocumentFromProject = vi.fn();
    const createDocumentFromImage = vi.fn();
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };

    openClipboardImageInWorkspace(
      { createDocumentFromProject, createDocumentFromImage },
      { pixels, palette: [[255, 0, 0, 255]] },
      "plain.png",
    );
    expect(createDocumentFromImage).toHaveBeenCalledTimes(1);
    expect(createDocumentFromProject).not.toHaveBeenCalled();

    openClipboardImageInWorkspace(
      { createDocumentFromProject, createDocumentFromImage },
      {
        pixels,
        palette: [[255, 0, 0, 255]],
        sourceProfile: { kind: "srgb" },
      },
      "profiled.aseprite",
    );
    expect(createDocumentFromProject).toHaveBeenCalledTimes(1);
  });
});

describe("save telemetry, clipboard rejection, preferences reset, and command dispatch helpers", () => {
  it("maps session outcomes to telemetry outcomes", () => {
    expect(telemetryOutcomeForSessionOutcome(SessionOutcome.Created)).toBe(
      TelemetryOperationOutcome.Success,
    );
    expect(telemetryOutcomeForSessionOutcome(SessionOutcome.Cancelled)).toBe(
      TelemetryOperationOutcome.Cancelled,
    );
    expect(telemetryOutcomeForSessionOutcome(SessionOutcome.Error)).toBe(
      TelemetryOperationOutcome.Failed,
    );
    expect(telemetryOutcomeForSessionOutcome(SessionOutcome.Ignored)).toBe(
      TelemetryOperationOutcome.Ignored,
    );
  });

  it("maps timeline paste rejection reasons to non-empty localized notices", () => {
    for (const reason of Object.values(TimelinePasteRejectionReason)) {
      expect(timelinePasteRejectionMessage(reason).length).toBeGreaterThan(0);
    }
  });

  it("resets only the requested preference groups and flushes async writes", async () => {
    const deps: PreferenceResetDeps = {
      resetToolPreferences: vi.fn(),
      resetEffectPreferences: vi.fn(),
      resetDocumentPreferences: vi.fn(),
      initializeUserPresets: vi.fn(async () => {}),
      resetUserBrushes: vi.fn(),
      resetUserShades: vi.fn(),
      flushUserPresets: vi.fn(async () => {}),
      resetConfigurationPreferences: vi.fn(),
      resetChromePreferences: vi.fn(),
      resetWheelDevice: vi.fn(),
      resetDefaultTimelineFirstFrame: vi.fn(),
      resetAppearanceMode: vi.fn(),
      resetAppearanceTheme: vi.fn(),
      resetUiLanguage: vi.fn(async () => {}),
      resetRecoverySettings: vi.fn(async () => {}),
      clearRecentFiles: vi.fn(async () => {}),
    };

    await resetEditorPreferences(
      [PreferenceResetTarget.Tools, PreferenceResetTarget.UserBrushes],
      deps,
    );
    expect(deps.resetToolPreferences).toHaveBeenCalledTimes(1);
    expect(deps.initializeUserPresets).toHaveBeenCalledTimes(1);
    expect(deps.resetUserBrushes).toHaveBeenCalledTimes(1);
    expect(deps.resetUserShades).not.toHaveBeenCalled();
    expect(deps.flushUserPresets).toHaveBeenCalledTimes(1);
    expect(deps.resetConfigurationPreferences).not.toHaveBeenCalled();
  });

  it("dispatches requested editor actions and applies paste/repeat shortcut guards", () => {
    const openEffect = vi.fn();
    const repeatLastExport = vi.fn();
    const handlers: RequestedEditorActionHandlers = {
      keyboardShortcuts: vi.fn(),
      newSpriteFromSelection: vi.fn(),
      canRepeatExport: false,
      repeatLastExport,
      openEffect,
      togglePreview: vi.fn(),
      toggleTimeline: vi.fn(),
      toggleTimelineThumbnails: vi.fn(),
      copy: vi.fn(),
      copyMerged: vi.fn(),
      cut: vi.fn(),
      paste: vi.fn(),
      pasteNewLayer: vi.fn(),
      pasteNewSprite: vi.fn(),
      closeAllDocuments: vi.fn(),
      reopenClosedFile: vi.fn(),
      openNewTilemapDialog: vi.fn(),
      newDocument: vi.fn(),
      openDocument: vi.fn(),
      openPreferences: vi.fn(),
      closeDocument: vi.fn(),
      saveDocument: vi.fn(),
      saveDocumentAs: vi.fn(),
      exportCopy: vi.fn(),
      insertText: vi.fn(),
    };

    dispatchRequestedEditorAction("effect-outline", handlers);
    expect(openEffect).toHaveBeenCalledWith(EffectKind.Outline);

    dispatchRequestedEditorAction("repeat-export", handlers);
    expect(repeatLastExport).not.toHaveBeenCalled();
    dispatchRequestedEditorAction("repeat-export", { ...handlers, canRepeatExport: true });
    expect(repeatLastExport).toHaveBeenCalledTimes(1);

    expect(
      shouldDeferNativePaste(
        "paste",
        "v",
        { ctrl: true, meta: false, alt: false, shift: false },
        ClipboardRegion.Canvas,
      ),
    ).toBe(true);
    expect(
      shouldDeferNativePaste(
        "paste",
        "v",
        { ctrl: true, meta: false, alt: false, shift: false },
        ClipboardRegion.Palette,
      ),
    ).toBe(false);
    expect(shouldSkipRepeatedCommand(true, "save")).toBe(true);
    expect(shouldSkipRepeatedCommand(false, "save")).toBe(false);
    expect(shouldSkipRepeatedCommand(true, "undo")).toBe(false);
  });
});
