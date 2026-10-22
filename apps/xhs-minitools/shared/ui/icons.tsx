import styles from "$/shared/ui/ui.module.css";

/** Line icons drawn on a 24 × 24 grid, from the approved phone mockup. */
const PATHS = {
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-5-5-9 8.5" />
    </>
  ),
  export: (
    <>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7L4.5 11.5 9 16" />
      <path d="M5 11.5h9.5a5 5 0 0 1 0 10H11" />
    </>
  ),
  ratio: <rect x="6" y="3.5" width="12" height="17" rx="2" />,
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" />
      <path d="M6.34 2.5v3.84h3.84" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />
    </>
  ),
  split: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M14 2.5L10 21.5" />
      <path d="M14.5 8h3M15.5 12h3M16 16h2.5" strokeWidth="1.6" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </>
  ),
  down: <path d="M7 10l5 5 5-5" />,
  /*
   * Rotate arrows: an arc about (12, 12) ending at 45° on its upper side, and an arrowhead whose
   * corner is that end point. Its arms run straight up and across, which at 45° is ±45° off the
   * arc's tangent, so the head points along the turn and sits on the grid at small sizes.
   */
  rotateLeft: (
    <>
      <path d="M4.93 12A7.07 7.07 0 1 0 7 7" />
      <path d="M7 3.5V7h3.5" />
    </>
  ),
  rotateRight: (
    <>
      <path d="M19.07 12A7.07 7.07 0 1 1 17 7" />
      <path d="M17 3.5V7h-3.5" />
    </>
  ),
  swap: (
    <>
      <path d="M7 7h12M15.5 3.5L19 7l-3.5 3.5" />
      <path d="M17 17H5M8.5 13.5L5 17l3.5 3.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  save: (
    <>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  post: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  splitImage: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M12 4.5v15" />
      <path d="M14.5 8h3v3h-3zM17.5 11h-3v3h3z" strokeWidth="1.4" />
    </>
  ),
  pixelImage: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M8 9h3v3H8zM11 12h3v3h-3zM14 9h2.5v3H14z" strokeWidth="1.4" />
    </>
  ),
  arrows: (
    <>
      <path d="M5 12h14" />
      <path d="M8.5 8.5L5 12l3.5 3.5M15.5 8.5L19 12l-3.5 3.5" />
    </>
  ),
  /** The divider's rotate knob: {@link PATHS.rotateRight}'s turn, a little tighter for 18px. */
  rotate: (
    <>
      <path d="M18.5 12A6.5 6.5 0 1 1 16.6 7.4" />
      <path d="M16.6 3.6v3.8h-3.8" />
    </>
  ),
  minus: <path d="M6 12h12" />,
  plus: <path d="M6 12h12M12 6v12" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className,
  rotate,
}: {
  name: IconName;
  className?: string;
  /** Degrees, clockwise. */
  rotate?: number;
}) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      {PATHS[name]}
    </svg>
  );
}
