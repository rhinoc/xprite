import { useCallback, useState } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { PreferenceStoragePort } from "$/managers/ports/platform";
import { WheelDevice, type DetectedWheelDevice } from "$/managers/ports/wheel-device";

const WHEEL_DEVICE_STORAGE_KEY = "xse.input.wheel-device.v1";

function readWheelDevice(storage: PreferenceStoragePort) {
  try {
    const saved = storage.getItem(WHEEL_DEVICE_STORAGE_KEY);
    if (saved === WheelDevice.Auto || saved === WheelDevice.Mouse || saved === WheelDevice.Trackpad)
      return saved;
  } catch {
    /* Use automatic detection when storage is unavailable. */
  }
  return WheelDevice.Auto;
}

export function useWheelDevicePreferences() {
  const platform = useEditorPlatformPorts();
  if (!platform) throw new Error("Wheel preferences require platform ports");
  const storage: PreferenceStoragePort = platform.preferences;
  const [device, setDeviceState] = useState(() => readWheelDevice(storage));
  const [detected, reportDetected] = useState<DetectedWheelDevice | null>(null);
  const setDevice = useCallback(
    (next: WheelDevice) => {
      setDeviceState(next);
      try {
        storage.setItem(WHEEL_DEVICE_STORAGE_KEY, next);
      } catch {
        /* Keep the in-session preference. */
      }
    },
    [storage],
  );
  return { device, setDevice, detected, reportDetected };
}
