import { useEffect, useRef, useState } from "react";

import { useNormalMapProcessor } from "$/managers/normal-maps/processing-context";
import {
  NormalMapProcessingOperation,
  type NormalMapProcessingInput,
  type NormalMapProcessingResult,
} from "$/managers/ports/normal-map-processing";

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
    value: NormalMapProcessingResult;
    identity: object;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!input || !enabled) return;
    let current = true;
    const run = () => {
      void process(input).then(
        (value) => {
          if (
            current ||
            (live.current &&
              owner.current === identity &&
              latestInput.current?.operation === input.operation &&
              latestInput.current.source === input.source)
          )
            setResult({ input, value, identity });
        },
        (reason: unknown) => {
          if (current && !(reason instanceof Error && reason.name === "AbortError"))
            setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    };
    const frame =
      input.operation !== NormalMapProcessingOperation.Light
        ? requestAnimationFrame(run)
        : undefined;
    if (frame === undefined) run();
    return () => {
      current = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [input, enabled, process, identity]);
  const display =
    enabled &&
    result?.identity === identity &&
    result.input.operation === input?.operation &&
    result.input.source === input.source
      ? result
      : null;
  const current = result?.input === input ? result.value : null;
  return {
    pixels: current?.pixels ?? null,
    suggestedPaintedLightAngle: current?.suggestedPaintedLightAngle,
    displayPixels: display?.value.pixels ?? null,
    displayInvertY:
      display?.input.operation === NormalMapProcessingOperation.Generate &&
      display.input.options.invertY,
    error,
    busy: enabled && !!input && result?.input !== input && !error,
  };
}
