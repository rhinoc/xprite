export enum ShowcaseDevice {
  Computer = "computer",
  Ipad = "ipad",
  Phone = "phone",
}

export const SHOWCASE_DEVICES = [
  ShowcaseDevice.Computer,
  ShowcaseDevice.Ipad,
  ShowcaseDevice.Phone,
] as const;

export const SHOWCASE_DEVICE_NAMES = {
  [ShowcaseDevice.Computer]: "MacBook Pro",
  [ShowcaseDevice.Ipad]: "iPad",
  [ShowcaseDevice.Phone]: "iPhone",
} as const;

export function adjacentDevice(device: ShowcaseDevice, direction: number): ShowcaseDevice {
  const count = SHOWCASE_DEVICES.length;
  return SHOWCASE_DEVICES[(SHOWCASE_DEVICES.indexOf(device) + direction + count) % count];
}
