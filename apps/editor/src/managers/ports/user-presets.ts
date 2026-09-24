/** Structured-clone persistence for bitmap brushes and user-created shades. */
export interface UserPresetStoragePort {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
  close(): void;
}
