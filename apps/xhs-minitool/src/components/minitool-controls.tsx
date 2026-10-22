import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { MiniToolRenderer } from "$/managers/ports";
import type { MiniToolText } from "$/managers/text";
import { clientPoint, clientRect } from "@xprite/ui/utils";

import styles from "$/components/minitool.module.css";

export const MiniToolTextContext = createContext<MiniToolText>((key) => key);
export const MiniToolRendererContext = createContext<MiniToolRenderer | null>(null);

export const useText = () => useContext(MiniToolTextContext);

export function useRenderer(): MiniToolRenderer {
  const renderer = useContext(MiniToolRendererContext);
  if (!renderer) throw new Error("The mini tool renderer is missing.");
  return renderer;
}

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

/** A plain button with the phone layout's reset; `className` adds the look. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ className, children, ...props }, ref) {
    return (
      <button ref={ref} type="button" className={cx(styles.button, className)} {...props}>
        {children}
      </button>
    );
  },
);

function Chip({
  selected,
  onSelect,
  disabled,
  label,
  children,
}: {
  selected: boolean;
  onSelect(): void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Button
      className={styles.chip}
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </Button>
  );
}

/** One choice from a row of chips that scrolls sideways when it does not fit. */
export function ChipGroup<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  scroll = false,
}: {
  value: T | null;
  options: readonly { value: T; label: ReactNode; aria?: string }[];
  onChange(value: T): void;
  disabled?: boolean;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div
      className={cx(styles.chips, scroll && styles.scroller)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          selected={option.value === value}
          disabled={disabled}
          label={option.aria}
          onSelect={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      className={styles.toggle}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};

/**
 * A 44 pt slider with the mockup's square pixel thumb. `onChange` follows the finger;
 * `onCommit` runs once when it lifts (or after a key press).
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  valueText,
  centre,
  ticks = [],
  disabled,
  onStart,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  valueText?: string;
  /** Fill from this value instead of from the minimum. */
  centre?: number;
  ticks?: readonly number[];
  disabled?: boolean;
  onStart?(): void;
  onChange(value: number): void;
  onCommit?(value: number): void;
}) {
  const pointer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const fraction = (input: number) => (Math.min(max, Math.max(min, input)) - min) / (max - min);
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = clientRect(event.currentTarget);
    if (!rect || rect.width <= 0) return value;
    const ratio = Math.min(1, Math.max(0, (clientPoint(event).x - rect.left) / rect.width));
    return Math.round((min + ratio * (max - min)) / step) * step;
  };
  const update = (next: number) => {
    if (next === latest.current) return;
    latest.current = next;
    onChange(next);
  };
  const percent = (input: number) => `${(fraction(input) * 100).toFixed(2)}%`;
  const from = centre ?? min;
  return (
    <div
      className={styles.slider}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        onStart?.();
        update(fromPointer(event));
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) update(fromPointer(event));
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        onCommit?.(latest.current);
      }}
      onPointerCancel={() => {
        if (pointer.current === null) return;
        pointer.current = null;
        onCommit?.(latest.current);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        const direction = KEY_STEPS[event.key];
        if (disabled || !direction) return;
        event.preventDefault();
        onStart?.();
        const next = Math.min(max, Math.max(min, latest.current + direction * step));
        update(next);
        onCommit?.(next);
      }}
    >
      <div className={styles.track} />
      {ticks.map((tick) => (
        <div key={tick} className={styles.tick} style={{ left: percent(tick) }} />
      ))}
      <div
        className={styles.fill}
        style={{
          left: percent(Math.min(from, value)),
          width: `${(Math.abs(fraction(value) - fraction(from)) * 100).toFixed(2)}%`,
        }}
      />
      <div className={styles.thumb} style={{ left: percent(value) }} />
    </div>
  );
}
