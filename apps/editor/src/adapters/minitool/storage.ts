import { miniToolPreferences } from "$/adapters/minitool/sdk";
export const browserLocalStorage = miniToolPreferences;
export const readLocalStorage = miniToolPreferences.getItem;
export function writeLocalStorage(key: string, value: string): boolean {
  miniToolPreferences.setItem(key, value);
  return true;
}
export function removeLocalStorage(key: string): boolean {
  miniToolPreferences.removeItem(key);
  return true;
}
export const optionalLocalStorage = () => miniToolPreferences;
