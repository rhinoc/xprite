import { ShowcaseDevice } from "$/managers/showcase/showcase-device";

export type CapturedDevice = ShowcaseDevice.Computer | ShowcaseDevice.Phone;

export interface DemoPoint {
  x: number;
  y: number;
}

interface DemoRectangle extends DemoPoint {
  width: number;
  height: number;
}

export interface DeviceCaptureLayout {
  width: number;
  height: number;
  artwork: DemoRectangle;
  targets: { newSprite: DemoPoint; create: DemoPoint; play: DemoPoint };
}

/** The notch occupies the macOS menu bar; every Safari control shares the next row. */
export const MAC_BROWSER_LAYOUT = {
  menuHeight: 36,
  toolbarHeight: 56,
  toolbarCenterY: 64,
  controlTop: 44,
  controlHeight: 40,
  addressLeft: 0.295,
  addressWidth: 0.41,
} as const;

export const DEVICE_DISPLAY = {
  [ShowcaseDevice.Computer]: {
    width: 1440,
    height: 932,
    appTop: MAC_BROWSER_LAYOUT.menuHeight + MAC_BROWSER_LAYOUT.toolbarHeight,
    appHeight: 840,
  },
  [ShowcaseDevice.Phone]: { width: 430, height: 934, appTop: 64, appHeight: 846 },
} as const;

/** All device demonstrations share the native raster-writing clock. */
export const DEVICE_DEMO_TIME = {
  address: 4,
  typing: 4.3,
  typed: 6.4,
  opened: 7.5,
  dialog: 9.1,
  created: 11.35,
  writing: 16,
  written: 26,
  play: 26.8,
} as const;
