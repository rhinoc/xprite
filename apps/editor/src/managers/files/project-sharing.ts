import { useEffect, useMemo, useRef, useState } from "react";

import { PROJECT_SHARE_LIMITS, shareLinkStage } from "$/managers/files/sharing-policy";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { ShareArtifact } from "$/managers/ports/sharing";
import type { EditorDocument, EditorPersistenceSnapshot } from "@xprite/editor-core/document";
import { isCommittedPersistenceSnapshot } from "@xprite/editor-core/editor/persistence-snapshot";
import {
  shareProjectFromProject,
  prepareShareProjectSource,
  FULL_PROJECT_SHARE,
  ShareReduction,
  shareReductionAvailability,
  type ShareProjectSource,
} from "@xprite/editor-core/import-export";

export function createShareProjectSource(
  document: EditorDocument,
  snapshot: EditorPersistenceSnapshot,
): ShareProjectSource {
  if (!isCommittedPersistenceSnapshot(snapshot) || !snapshot.document.timeline)
    throw new Error("Unable to share this project.");
  return shareProjectFromProject(
    {
      image: { width: snapshot.document.width, height: snapshot.document.height },
      timeline: snapshot.document.timeline,
      palette: snapshot.document.palette,
    },
    document.name,
    document.timeline?.activeFrame ?? 0,
    document.timeline?.composeGroups === true,
  );
}

export function useProjectSharing(source: ShareProjectSource) {
  const port = useEditorPlatformPorts()?.files.sharing;
  const [artifact, setArtifact] = useState<ShareArtifact | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [reductions, setReductions] = useState(FULL_PROJECT_SHARE);
  const [showReductions, setShowReductions] = useState(false);
  const available = useMemo(() => shareReductionAvailability(source.sprite), [source]);
  const mounted = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    revision.current++;
    const abort = new AbortController();
    let current: ShareArtifact | null = null;
    setBusy(true);
    setArtifact(null);
    setError(null);
    setCopied(false);
    if (port) {
      let selected: ShareProjectSource;
      try {
        selected = prepareShareProjectSource(
          source,
          reductions,
          PROJECT_SHARE_LIMITS.maxProjectBytes,
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to share this project.");
        setShowReductions(true);
        setBusy(false);
        return () => {
          mounted.current = false;
          abort.abort();
        };
      }
      void port.create(selected, PROJECT_SHARE_LIMITS, abort.signal).then(
        (result) => {
          if (abort.signal.aborted) {
            port.release(result);
            return;
          }
          current = result;
          setArtifact(result);
          if (result.urlCharacters > PROJECT_SHARE_LIMITS.quietUrlCharacters || !result.qr)
            setShowReductions(true);
          setBusy(false);
        },
        (reason: unknown) => {
          if (abort.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : "Unable to share this project.");
          setShowReductions(true);
          setBusy(false);
        },
      );
    } else {
      setError("Sharing is unavailable in this browser.");
      setBusy(false);
    }
    return () => {
      mounted.current = false;
      abort.abort();
      if (current) port?.release(current);
    };
  }, [port, source, reductions]);
  const copy = async () => {
    if (!artifact?.url || !port || copyBusy || busy) return;
    const copyingRevision = revision.current;
    setCopyBusy(true);
    setError(null);
    setCopied(false);
    try {
      await port.copy(artifact.url);
      if (mounted.current && copyingRevision === revision.current) setCopied(true);
    } catch (reason) {
      if (mounted.current && copyingRevision === revision.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Copy failed. Select the link and copy it manually.",
        );
    } finally {
      if (mounted.current) setCopyBusy(false);
    }
  };
  return {
    artifact,
    busy,
    copied,
    copyBusy,
    canCopy: !!port?.canCopy,
    error,
    reductions,
    available,
    showReductions,
    maxUrlCharacters: PROJECT_SHARE_LIMITS.maxUrlCharacters,
    frameCount: artifact?.frameCount ?? source.sprite.frames.length,
    layerCount: artifact?.layerCount ?? source.sprite.layers.length,
    setReduction: (option: ShareReduction, checked: boolean) => {
      revision.current++;
      setBusy(true);
      setArtifact(null);
      setCopied(false);
      setReductions((previous) => ({ ...previous, [option]: checked }));
    },
    stage: artifact ? shareLinkStage(artifact.urlCharacters) : null,
    copy,
    downloadQr: () => {
      if (artifact?.qr && !busy) port?.downloadQr(artifact, source.name);
    },
  };
}

export { ShareLinkStage } from "$/managers/files/sharing-policy";
export { ShareReduction } from "@xprite/editor-core/import-export";
export type { ShareProjectSource } from "@xprite/editor-core/import-export";
