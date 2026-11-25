import type { EditorDocument, EditorPersistenceSnapshot } from "@xprite/editor-core/document";

export interface NormalMapSourceDocumentCore {
  importExport: {
    getSpriteSheetPreview(): EditorDocument | null;
  };
  getCommittedPersistenceSnapshot(): Readonly<EditorPersistenceSnapshot> | null;
}

export interface NormalMapSourceSnapshot {
  readonly document: EditorDocument | null;
  readonly pixelRevision: number;
}

export interface NormalMapRealDocumentRecord {
  readonly owner: object;
  readonly documentKey: string | number | null;
  readonly document: EditorDocument;
  readonly pixelRevision: number;
}

export interface ResolvedNormalMapSource {
  readonly document: EditorDocument | null;
  readonly pixelRevision: number;
  readonly realRecord: NormalMapRealDocumentRecord | null;
}

/**
 * Keeps Lighting Preview and normal-map generation bound to the real document sprite
 * while a temporary Sprite Sheet live preview overrides the editor canvas snapshot.
 */
export function resolveNormalMapSourceDocument(
  core: NormalMapSourceDocumentCore | null,
  snapshot: NormalMapSourceSnapshot | null,
  owner: object,
  documentKey: string | number | null,
  lastReal: NormalMapRealDocumentRecord | null,
): ResolvedNormalMapSource {
  const sheetPreview = core?.importExport.getSpriteSheetPreview() ?? null;
  if (!sheetPreview) {
    const document = snapshot?.document ?? null;
    const pixelRevision = snapshot?.pixelRevision ?? 0;
    return {
      document,
      pixelRevision,
      realRecord: document ? { owner, documentKey, document, pixelRevision } : null,
    };
  }
  if (lastReal && lastReal.owner === owner && lastReal.documentKey === documentKey) {
    return {
      document: lastReal.document,
      pixelRevision: lastReal.pixelRevision,
      realRecord: lastReal,
    };
  }
  const committed = core?.getCommittedPersistenceSnapshot()?.document ?? null;
  if (committed) {
    const record: NormalMapRealDocumentRecord = {
      owner,
      documentKey,
      document: committed,
      pixelRevision: 0,
    };
    return {
      document: committed,
      pixelRevision: 0,
      realRecord: record,
    };
  }
  return { document: null, pixelRevision: 0, realRecord: null };
}
