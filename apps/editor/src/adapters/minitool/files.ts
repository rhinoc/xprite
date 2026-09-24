import { saveAlbumImage } from "$/adapters/minitool/sdk";
export const canPickOpenFiles = () => false;
export const canPickSaveFile = () => false;
export const pickOpenFiles = () => null;
export const pickSaveFile = () => null;
export const requestFileWritePermission = () => undefined;
export async function writeFileHandle(): Promise<never> {
  throw new Error("小红书内不能写入外部文件。");
}
export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}
export function downloadBlob(blob: Blob): Promise<void> {
  return saveAlbumImage(blob);
}
