import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { useNormalMapLightRendererFactory } from "$/managers/normal-maps/processing-context";
import { useProcessedPixels } from "$/managers/normal-maps/use-processed-pixels";
import { NormalMapProcessingOperation } from "$/managers/ports/normal-map-processing";
import type {
  NormalMapLightFrame,
  NormalMapLightRendererPort,
} from "$/managers/ports/normal-map-rendering";
import type { PixelBuffer, Point } from "@xprite/editor-core/base";
import type { NormalMapLightOptions } from "@xprite/editor-core/image-editing";

export interface NormalLightingScene {
  source: PixelBuffer;
  normals: PixelBuffer | null;
  options: NormalMapLightOptions;
  identity: object;
}
const EMPTY_IDENTITY = {};

/** Light motion is local to the surface and coalesced to display frames. */
export function useNormalMapLightSurface(
  canvas: HTMLCanvasElement | null,
  scene: NormalLightingScene | null,
  view: Pick<NormalMapLightFrame, "viewport" | "origin" | "zoom" | "pixelRatio">,
  marker: RefObject<HTMLSpanElement | null>,
) {
  const create = useNormalMapLightRendererFactory();
  const renderer = useRef<NormalMapLightRendererPort | null>(null);
  const latest = useRef({ scene, view });
  latest.current = { scene, view };
  const position = useRef<Point | null>(null);
  const documentIdentity = useRef<object | null>(null);
  const scheduled = useRef(0);
  const [fallback, setFallback] = useState(false);
  const [cpuPosition, setCpuPosition] = useState<Point | null>(null);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const schedule = useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = 0;
      const current = latest.current;
      if (!current.scene) return;
      const point = position.current ?? current.scene.options.position;
      if (marker.current) {
        marker.current.style.left = `${current.view.origin.x + point.x * current.view.zoom}px`;
        marker.current.style.top = `${current.view.origin.y + point.y * current.view.zoom}px`;
      }
      if (fallbackRef.current) {
        setCpuPosition(point);
        return;
      }
      try {
        renderer.current?.render({
          ...current.scene,
          ...current.view,
          options: { ...current.scene.options, position: point },
        });
      } catch {
        renderer.current?.dispose();
        renderer.current = null;
        setFallback(true);
        setCpuPosition(point);
      }
    });
  }, [marker]);
  useEffect(() => {
    if (!scene || !canvas) return;
    try {
      renderer.current = create?.(canvas) ?? null;
    } catch {
      renderer.current = null;
    }
    setFallback(!renderer.current);
    schedule();
    return () => {
      cancelAnimationFrame(scheduled.current);
      scheduled.current = 0;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [canvas, create, !!scene, schedule]);
  useEffect(() => {
    if (scene && documentIdentity.current !== scene.identity) {
      documentIdentity.current = scene.identity;
      position.current = null;
      setCpuPosition(null);
    }
    schedule();
  }, [scene?.identity, schedule]);
  useEffect(schedule, [
    scene,
    view.viewport.width,
    view.viewport.height,
    view.origin.x,
    view.origin.y,
    view.zoom,
    view.pixelRatio,
    fallback,
    schedule,
  ]);
  const input = useMemo(
    () =>
      scene && fallback
        ? ({
            operation: NormalMapProcessingOperation.Light,
            source: scene.source,
            normals: scene.normals,
            options: { ...scene.options, position: cpuPosition ?? scene.options.position },
          } as const)
        : null,
    [scene, fallback, cpuPosition],
  );
  const cpu = useProcessedPixels(input, !!scene && fallback, scene?.identity ?? EMPTY_IDENTITY);
  return {
    fallback,
    pixels: cpu.displayPixels,
    error: cpu.error,
    preparing: fallback && cpu.busy && !cpu.displayPixels,
    setPosition: useCallback(
      (point: Point) => {
        position.current = point;
        schedule();
      },
      [schedule],
    ),
  };
}
