import { useEffect, useRef, useState } from "react";

import { useNormalMapProcessor } from "$/managers/normal-maps/processing-context";
import {
  NormalMapProcessingOperation,
  type NormalMapProcessingInput,
} from "$/managers/ports/normal-map-processing";
import type { PixelBuffer } from "@xprite/editor-core/base";

export function useProcessedPixels(
  input: NormalMapProcessingInput | null,
  enabled: boolean,
  identity: object,
) {
  const process = useNormalMapProcessor(enabled);
  const latestInput = useRef(input);
  latestInput.current = input;
  const live = useRef(false);
  const owner = useRef(identity);
  owner.current = identity;
  useEffect(() => {
    live.current = enabled;
    return () => {
      live.current = false;
    };
  }, [enabled, identity]);
  const [result, setResult] = useState<{
    input: NormalMapProcessingInput;
    pixels: PixelBuffer;
    identity: object;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!input || !enabled) return;
    let current = true;
    const run = () => {
      void process(input).then(
        (pixels) => {
          if (
            current ||
            (live.current &&
              owner.current === identity &&
              latestInput.current?.source === input.source)
          )
            setResult({ input, pixels, identity });
        },
        (reason: unknown) => {
          if (current && !(reason instanceof Error && reason.name === "AbortError"))
            setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    };
    const frame =
      input.operation === NormalMapProcessingOperation.Generate
        ? requestAnimationFrame(run)
        : undefined;
    if (frame === undefined) run();
    return () => {
      current = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [input, enabled, process, identity]);
  const display =
    enabled && result?.identity === identity && result.input.source === input?.source
      ? result
      : null;
  return {
    pixels: result?.input === input ? result.pixels : null,
    displayPixels: display?.pixels ?? null,
    displayInvertY: display?.input.options.invertY ?? false,
    error,
    busy: enabled && !!input && result?.input !== input && !error,
  };
}
