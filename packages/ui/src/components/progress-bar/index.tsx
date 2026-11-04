import styles from "$/components/progress-bar/progress-bar.module.css";

const PERCENT = 100;

export interface ProgressBarProps {
  label: string;
  /** Omit until measurable progress is available; otherwise use a fraction from 0 to 1. */
  value?: number;
  className?: string;
}

/** The striped processing indicator shared by image and video previews. */
export function ProgressBar({ label, value, className }: ProgressBarProps) {
  const progress =
    value === undefined || !Number.isFinite(value)
      ? undefined
      : Math.max(0, Math.min(1, value)) * PERCENT;
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-slot="progress-bar"
      data-indeterminate={progress === undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={PERCENT}
      aria-valuenow={progress}
    >
      <div className={styles.fill} style={{ width: `${progress ?? PERCENT}%` }} />
    </div>
  );
}
