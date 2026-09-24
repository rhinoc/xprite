import { createContext, useContext, type ReactNode } from "react";

import { WheelDevice, type DetectedWheelDevice } from "$/managers/ports/wheel-device";

export { WheelDevice } from "$/managers/ports/wheel-device";
export type { DetectedWheelDevice } from "$/managers/ports/wheel-device";

const WheelDeviceContext = createContext<{
  device: WheelDevice;
  setDevice: (device: WheelDevice) => void;
  detected: DetectedWheelDevice | null;
  reportDetected: (device: DetectedWheelDevice) => void;
}>({ device: WheelDevice.Auto, setDevice: () => {}, detected: null, reportDetected: () => {} });

export function WheelDeviceProvider({
  device,
  setDevice,
  detected,
  reportDetected,
  children,
}: {
  device: WheelDevice;
  setDevice: (device: WheelDevice) => void;
  detected: DetectedWheelDevice | null;
  reportDetected: (device: DetectedWheelDevice) => void;
  children: ReactNode;
}) {
  return (
    <WheelDeviceContext.Provider value={{ device, setDevice, detected, reportDetected }}>
      {children}
    </WheelDeviceContext.Provider>
  );
}

export function useWheelDevice() {
  return useContext(WheelDeviceContext);
}
