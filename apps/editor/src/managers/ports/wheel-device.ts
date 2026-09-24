export enum WheelDevice {
  Auto = "auto",
  Mouse = "mouse",
  Trackpad = "trackpad",
}

export type DetectedWheelDevice = WheelDevice.Mouse | WheelDevice.Trackpad;
