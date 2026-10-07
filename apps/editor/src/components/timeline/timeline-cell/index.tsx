import { type UiPartName } from "@xprite/ui/assets";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import { stylusPointerInputProps } from "@xprite/ui/utils";

export function timelineFrameLabel(index: number, firstFrame = 1) {
  const frame = firstFrame + index;
  const suffix = frame % 100;
  const text = String(suffix);
  return frame >= 100 && suffix < 10 ? text.padStart(2, "0") : text;
}

export function TimelineCellButton({
  part: _part,
  overlayPart: _overlayPart,
  left,
  top,
  width = 24,
  height = 24,
  text: _text,
  textColor,
  label,
  selected = false,
  onClick,
  onDoubleClick,
  className = "",
  onHover,
  onLeave,
  frameIndex,
  layerIndex,
}: {
  part: UiPartName;
  overlayPart?: UiPartName;
  left: number;
  top: number;
  width?: number;
  height?: number;
  text?: string;
  textColor?: string;
  label: string;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  className?: string;
  onHover?: () => void;
  onLeave?: () => void;
  frameIndex?: number;
  layerIndex?: number;
}) {
  return (
    <button
      type="button"
      {...stylusPointerInputProps()}
      className={`xse-timeline-cell ${className}`}
      data-timeline-kind={layerIndex === undefined ? "frames" : "cels"}
      data-frame={frameIndex}
      data-layer={layerIndex}
      aria-label={label}
      aria-pressed={selected}
      onPointerDown={(event) => {
        if (event.button === 0) onClick();
      }}
      onClick={(event) => {
        if (event.detail === 0) onClick();
      }}
      onDoubleClick={onDoubleClick}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      style={{
        left: left * sx,
        top: top * sy,
        width: width * sx,
        height: height * sy,
        color: textColor,
      }}
    />
  );
}
