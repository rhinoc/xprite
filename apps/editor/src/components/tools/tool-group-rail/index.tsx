import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@xprite/ui";
import { type SurfaceBounds } from "@xprite/ui";
import { useUi } from "@xprite/ui";
import { Tooltip, TooltipGroup } from "@xprite/ui";
import { centerUiPixel } from "@xprite/ui/assets";
import { uiMetrics } from "@xprite/ui/assets";
import { UiPart, UiIcon, type UiPartName } from "@xprite/ui/assets";
import { surfaceLayout, UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import { UI_SCALE } from "@xprite/ui/canvas";
import {
  viewportSize,
  hitElement,
  clientPoint,
  clientRect,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

import styles from "$/components/tools/tool-group-rail/tool-group-rail.module.css";

const PRIMARY_TOOL_POINTER_BUTTON = 0;
const PRIMARY_TOOL_POINTER_BUTTON_MASK = 1;

export interface ToolOption {
  value: string;
  label: string;
  icon: UiPartName;
  tooltip?: string;
  /** Keep unavailable tools visible without dispatching an action. */
  disabled?: boolean;
}
export interface ToolGroup {
  id: string;
  tools: readonly ToolOption[];
}
export interface ToolGroupRailProps {
  groups: readonly ToolGroup[];
  value: string;
  onValueChange: (value: string) => void;
  onActiveToolPress?: (trigger: HTMLButtonElement) => void;
  openToolOptions?: string;
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  /** Physical pixels between adjacent group faces. */
  pitch?: number;
  layout?: "column" | "row";
  buttonStyle?: CSSProperties;
}

interface ToolFace {
  bounds: SurfaceBounds;
  tool: ToolOption;
  selected: boolean;
  hot: boolean;
  last: boolean;
}

/** Tool group selection and remembered face shared by column and row layouts. */
function useToolGroupSelection(
  groups: readonly ToolGroup[],
  value: string,
  onValueChange: (value: string) => void,
) {
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const select = (tool: ToolOption, group: ToolGroup) => {
    if (tool.disabled) return;
    setRemembered((previous) => ({ ...previous, [group.id]: tool.value }));
    onValueChange(tool.value);
  };
  const current = (group: ToolGroup) =>
    group.tools.find((tool) => tool.value === value && !tool.disabled) ??
    group.tools.find((tool) => tool.value === remembered[group.id] && !tool.disabled) ??
    group.tools.find((tool) => !tool.disabled) ??
    group.tools[0];
  useEffect(() => {
    const group = groups.find((group) => group.tools.some((tool) => tool.value === value));
    if (group)
      setRemembered((previous) =>
        previous[group.id] === value ? previous : { ...previous, [group.id]: value },
      );
  }, [groups, value]);
  return { remembered, select, current };
}
/** ToolBar::onPaint/ToolStrip::onPaint overlap faces on one shared surface.
 * Sampling each face separately blends the shared borders twice. */
function ToolStripArtwork({
  faces,
  relativeTo = { x: 0, y: 0 },
  style,
}: {
  faces: readonly ToolFace[];
  relativeTo?: { x: number; y: number };
  style?: CSSProperties;
}) {
  const { style: uiStyle } = useUi();
  const bounds = {
    x: Math.min(...faces.map((face) => face.bounds.x)),
    y: Math.min(...faces.map((face) => face.bounds.y)),
    width: 0,
    height: 0,
  };
  bounds.width = Math.max(...faces.map((face) => face.bounds.x + face.bounds.width)) - bounds.x;
  bounds.height = Math.max(...faces.map((face) => face.bounds.y + face.bounds.height)) - bounds.y;
  const layout = surfaceLayout(bounds);
  return (
    <span
      aria-hidden="true"
      className={styles.artworkStrip}
      style={{
        position: "absolute",
        left: layout.left - Math.floor(relativeTo.x * sx),
        top: layout.top - Math.floor(relativeTo.y * sy),
        width: layout.width,
        height: layout.height,
        pointerEvents: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {faces.map((face, index) => {
        const { bounds: box, tool } = face;
        const part =
          !tool.disabled && (face.hot || face.selected)
            ? "toolbutton_hot"
            : face.last
              ? "toolbutton_last"
              : "toolbutton_normal";
        const icon = uiStyle.parts[tool.icon];
        return (
          <UiPart
            key={index}
            part={part}
            scale={2}
            drawCenter
            className={styles.face}
            style={{
              position: "absolute",
              left: box.x - bounds.x,
              top: box.y - bounds.y,
              width: box.width,
              height: box.height,
              pointerEvents: "none",
            }}
          >
            <UiIcon
              part={tool.icon}
              scale={2}
              x={centerUiPixel(box.x, box.width, icon.width * 2) - box.x}
              y={centerUiPixel(box.y, box.height, icon.height * 2) - box.y}
              color={tool.disabled ? uiStyle.colors.disabled : undefined}
            />
          </UiPart>
        );
      })}
    </span>
  );
}

/** ToolBar/ToolStrip interaction: immediate opening, captured drag traversal,
 * remembered selection per group, and persistent popup on the initial release. */
export function ToolGroupRail({
  groups,
  value,
  onValueChange,
  onActiveToolPress,
  openToolOptions,
  bounds,
  relativeTo,
  pitch,
  layout = "column",
  buttonStyle,
}: ToolGroupRailProps) {
  const { style: uiStyle, translateKey, translateSource } = useUi();
  const metrics = uiMetrics(uiStyle);
  const groupPitch = pitch ?? metrics.toolPitch * UI_SCALE;
  const popupFacePitch = metrics.toolPitch * UI_SCALE;
  const hotRegion = metrics.toolPitch * UI_SCALE + UI_SCALE;
  const owner = useId();
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const [hotItem, setHotItem] = useState<number | null>(null);
  const [popupPlacement, setPopupPlacement] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const { remembered, select, current } = useToolGroupSelection(groups, value, onValueChange);
  const gesture = useRef<{
    pointerId: number;
    strip: boolean;
    element: HTMLButtonElement;
  } | null>(null);
  const currentValue = useRef(value);
  currentValue.current = value;
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const endGesture = () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId);
  };
  const activateToolOptions = (tool: ToolOption, groupIndex: number) => {
    const trigger = triggerRefs.current[groupIndex];
    if (!onActiveToolPress || tool.value !== currentValue.current || !trigger) return false;
    endGesture();
    setOpen(null);
    trigger.focus();
    onActiveToolPress(trigger);
    return true;
  };
  const cancelLostGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (
      active?.pointerId === event.pointerId &&
      active.element === event.currentTarget &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      endGesture();
      setOpen(null);
    }
  };

  useLayoutEffect(() => {
    if (open === null) {
      setPopupPlacement(null);
      return;
    }
    const update = () => {
      const trigger = triggerRefs.current[open];
      const optionCount = groups[open]?.tools.length ?? 0;
      if (!trigger || !optionCount) {
        setPopupPlacement(null);
        return;
      }
      const rect = clientRect(trigger);
      const width = (optionCount - 1) * popupFacePitch + bounds.width;
      const height = bounds.height + UI_SCALE;
      if (layout === "row") {
        const left = Math.max(4, Math.min(rect.left, viewportSize(window).width - width - 4));
        const below = rect.bottom + 1;
        const top =
          below + height <= viewportSize(window).height - 4
            ? below
            : Math.max(4, rect.top - height - 1);
        setPopupPlacement({ left, top, width, height });
      } else {
        const left = rect.left - width >= 4 ? rect.left - width : rect.right + 1;
        setPopupPlacement({
          left: Math.max(4, Math.min(left, viewportSize(window).width - width - 4)),
          top: Math.max(4, Math.min(rect.top, viewportSize(window).height - height - 4)),
          width,
          height,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, layout, groups, popupFacePitch, bounds.width, bounds.height, value, remembered]);

  useEffect(() => {
    const targetAt = (event: PointerEvent) => {
      const target = hitElement(
        { x: clientPoint(event).x, y: clientPoint(event).y },
        document,
      )?.closest<HTMLElement>("[data-ui-tool-owner]");
      return target?.dataset.uiToolOwner === owner ? target : null;
    };
    const move = (event: PointerEvent) => {
      if (!gesture.current && open === null) return;
      if (
        gesture.current?.pointerId === event.pointerId &&
        event.pointerType !== "touch" &&
        !(event.buttons & PRIMARY_TOOL_POINTER_BUTTON_MASK)
      ) {
        endGesture();
        return;
      }
      const target = targetAt(event);
      if (gesture.current && gesture.current.pointerId === event.pointerId && target) {
        const groupIndex = Number(target.dataset.uiGroupIndex);
        const group = groups[groupIndex];
        if (!group || group.tools.every((tool) => tool.disabled)) return;
        if (target.dataset.uiToolIndex !== undefined) {
          gesture.current.strip = true;
          select(group.tools[Number(target.dataset.uiToolIndex)], group);
        } else {
          select(current(group), group);
          setOpen(group.tools.length > 1 ? groupIndex : null);
        }
      } else if (!gesture.current && open !== null && !target) {
        // Keep the popup open while the pointer crosses the adjoining control faces.
        const insideHotRegion = [...triggerRefs.current, ...itemRefs.current].some((button) => {
          if (!button) return false;
          const rect = clientRect(button);
          const scaleX = rect.width / (bounds.width * sx);
          const scaleY = rect.height / (bounds.height * sy);
          const marginX = hotRegion * sx * scaleX,
            marginY = hotRegion * sy * scaleY;
          return (
            clientPoint(event).x >= rect.left - marginX &&
            clientPoint(event).x <= rect.right + marginX &&
            clientPoint(event).y >= rect.top - marginY &&
            clientPoint(event).y <= rect.bottom + marginY
          );
        });
        if (!insideHotRegion) setOpen(null);
      }
    };
    const up = (event: PointerEvent) => {
      const active = gesture.current;
      if (active?.pointerId !== event.pointerId) return;
      if (active.strip || !targetAt(event)) setOpen(null);
      endGesture();
    };
    const cancel = () => {
      endGesture();
      setOpen(null);
    };
    const down = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target) && !targetAt(event)) {
        endGesture();
        setOpen(null);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", cancel);
    };
  });

  const faceBounds = (index: number) =>
    layout === "row"
      ? {
          ...bounds,
          x: bounds.x + index * groupPitch,
          width: index === groups.length - 1 ? bounds.width + UI_SCALE : bounds.width,
        }
      : {
          ...bounds,
          y: bounds.y + index * groupPitch,
          height: index === groups.length - 1 ? bounds.height + UI_SCALE : bounds.height,
        };
  const faces = useMemo(
    () =>
      groups.map((group, index) => ({
        bounds: faceBounds(index),
        tool: { ...current(group), disabled: group.tools.every((option) => option.disabled) },
        selected: group.tools.some((option) => option.value === value),
        hot: hot === index,
        last: index === groups.length - 1,
      })),
    [
      groups,
      value,
      remembered,
      hot,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      groupPitch,
      layout,
    ],
  );
  const tooltipPlacement = layout === "row" ? "top" : "auto";

  return (
    <TooltipGroup retainWarm={open !== null}>
      <div
        ref={root}
        className={styles.root}
        data-layout={layout}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open !== null) {
            event.preventDefault();
            event.stopPropagation();
            triggerRefs.current[open]?.focus();
            setOpen(null);
          }
        }}
      >
        {groups.length > 0 && (
          <ToolStripArtwork relativeTo={relativeTo} style={buttonStyle} faces={faces} />
        )}
        {groups.map((group, index) => {
          const tool = current(group);
          return (
            <Tooltip key={group.id} text={tool.tooltip ?? tool.label} placement={tooltipPlacement}>
              <Button
                buttonRef={(node) => {
                  triggerRefs.current[index] = node;
                }}
                bounds={faceBounds(index)}
                relativeTo={relativeTo}
                part={index === groups.length - 1 ? "toolbutton_last" : "toolbutton_normal"}
                hotPart="toolbutton_hot"
                selectedPart="toolbutton_hot"
                insetContent={false}
                paintArtwork={false}
                onPointerEnter={() => setHot(index)}
                onPointerLeave={() => setHot(null)}
                disabled={group.tools.every((option) => option.disabled)}
                icon={tool.icon}
                aria-label={tool.label}
                title={tool.label}
                selected={group.tools.some((option) => option.value === value)}
                aria-pressed={group.tools.some((option) => option.value === value)}
                aria-expanded={
                  onActiveToolPress
                    ? group.tools.some((option) => option.value === openToolOptions)
                    : group.tools.length > 1
                      ? open === index
                      : undefined
                }
                aria-haspopup={
                  onActiveToolPress ? "dialog" : group.tools.length > 1 ? "menu" : undefined
                }
                {...stylusPointerInputProps()}
                data-ui-tool-owner={owner}
                data-ui-group-index={index}
                style={buttonStyle}
                onPointerDown={(event) => {
                  if (event.button !== PRIMARY_TOOL_POINTER_BUTTON || tool.disabled) return;
                  // Let a finger scroll the rail; activate only after an uncancelled tap.
                  if (event.pointerType === "touch") return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  if (activateToolOptions(tool, index)) return;
                  endGesture();
                  if (onActiveToolPress) {
                    select(tool, group);
                    setOpen(null);
                    return;
                  }
                  event.currentTarget.setPointerCapture(event.pointerId);
                  gesture.current = {
                    pointerId: event.pointerId,
                    strip: false,
                    element: event.currentTarget,
                  };
                  select(tool, group);
                  setOpen(group.tools.length > 1 ? index : null);
                }}
                onPointerUp={(event) => {
                  if (event.pointerType !== "touch" || tool.disabled) return;
                  event.currentTarget.focus();
                  if (activateToolOptions(tool, index)) return;
                  select(tool, group);
                  setOpen(!onActiveToolPress && group.tools.length > 1 ? index : null);
                }}
                onClick={(event) => {
                  if (event.detail === 0) {
                    if (activateToolOptions(tool, index)) return;
                    select(tool, group);
                    setOpen(!onActiveToolPress && group.tools.length > 1 ? index : null);
                  }
                }}
                onLostPointerCapture={cancelLostGesture}
                onKeyDown={(event) => {
                  const opensPopup =
                    layout === "row" ? event.key === "ArrowDown" : event.key === "ArrowLeft";
                  const previousGroup =
                    layout === "row" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
                  const nextGroup =
                    layout === "row" ? event.key === "ArrowRight" : event.key === "ArrowDown";
                  if (opensPopup || previousGroup || nextGroup) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (opensPopup) {
                      if (onActiveToolPress) {
                        if (!activateToolOptions(tool, index)) select(tool, group);
                        return;
                      }
                      if (group.tools.length > 1) {
                        setOpen(index);
                        requestAnimationFrame(() =>
                          itemRefs.current[
                            group.tools.findIndex((option) => !option.disabled)
                          ]?.focus(),
                        );
                      }
                    } else {
                      const direction = previousGroup ? -1 : 1;
                      for (let step = 1; step <= groups.length; step++) {
                        const next = (index + direction * step + groups.length) % groups.length;
                        if (groups[next].tools.some((option) => !option.disabled)) {
                          triggerRefs.current[next]?.focus();
                          break;
                        }
                      }
                    }
                  }
                }}
              />
            </Tooltip>
          );
        })}
        {!onActiveToolPress &&
          open !== null &&
          popupPlacement &&
          createPortal(
            <div
              ref={popup}
              className={styles.popup}
              role="menu"
              aria-label={`${translateSource(groups[open].id)} ${translateKey("ui.tools")}`}
              style={popupPlacement}
            >
              <ToolStripArtwork
                relativeTo={{ x: 0, y: 0 }}
                style={{ left: 0, top: 0, zIndex: "var(--ui-tool-popup-layer)" }}
                faces={groups[open].tools.map((tool, index) => ({
                  bounds: {
                    ...bounds,
                    x: index * popupFacePitch,
                    y: 0,
                  },
                  tool,
                  selected: value === tool.value,
                  hot: hotItem === index,
                  last: true,
                }))}
              />
              {groups[open].tools.map((tool, index, options) => (
                <Tooltip
                  key={tool.value}
                  text={tool.tooltip ?? tool.label}
                  placement={tooltipPlacement}
                >
                  <Button
                    buttonRef={(node) => {
                      itemRefs.current[index] = node;
                    }}
                    bounds={{
                      ...bounds,
                      x: index * popupFacePitch,
                      y: 0,
                    }}
                    relativeTo={{ x: 0, y: 0 }}
                    part="toolbutton_last"
                    hotPart="toolbutton_hot"
                    selectedPart="toolbutton_hot"
                    paintArtwork={false}
                    onPointerEnter={() => setHotItem(index)}
                    onPointerLeave={() => setHotItem(null)}
                    disabled={tool.disabled}
                    insetContent={false}
                    icon={tool.icon}
                    selected={value === tool.value}
                    role="menuitemradio"
                    aria-checked={value === tool.value}
                    aria-label={tool.label}
                    title={tool.label}
                    {...stylusPointerInputProps()}
                    data-ui-tool-owner={owner}
                    data-ui-group-index={open}
                    data-ui-tool-index={index}
                    style={{ zIndex: "var(--ui-tool-popup-layer)" }}
                    onPointerDown={(event) => {
                      if (event.button !== PRIMARY_TOOL_POINTER_BUTTON || tool.disabled) return;
                      event.preventDefault();
                      if (
                        activateToolOptions(tool, Number(event.currentTarget.dataset.uiGroupIndex))
                      )
                        return;
                      endGesture();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      gesture.current = {
                        pointerId: event.pointerId,
                        strip: true,
                        element: event.currentTarget,
                      };
                      select(tool, groups[open]);
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        if (
                          activateToolOptions(
                            tool,
                            Number(event.currentTarget.dataset.uiGroupIndex),
                          )
                        )
                          return;
                        select(tool, groups[open]);
                        triggerRefs.current[open]?.focus();
                        setOpen(null);
                      }
                    }}
                    onLostPointerCapture={cancelLostGesture}
                    onKeyDown={(event) => {
                      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                        event.preventDefault();
                        event.stopPropagation();
                        const enabled = options
                          .map((option, i) => (option.disabled ? -1 : i))
                          .filter((i) => i >= 0);
                        const at = enabled.indexOf(index);
                        const next =
                          event.key === "Home"
                            ? enabled[0]
                            : event.key === "End"
                              ? enabled[enabled.length - 1]
                              : enabled[
                                  (at + (event.key === "ArrowLeft" ? enabled.length - 1 : 1)) %
                                    enabled.length
                                ];
                        itemRefs.current[next]?.focus();
                      }
                    }}
                  />
                </Tooltip>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </TooltipGroup>
  );
}
