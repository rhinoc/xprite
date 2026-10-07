export interface ShareObjectStore {
  /** Atomic create-if-absent. A retirement fence must also prevent this write. */
  writeOnce(id: string, bytes: Uint8Array, sha256: string): Promise<void>;
  read(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
  /** Replace with a persistent zero-byte marker, fencing late conditional puts. */
  fence(id: string): Promise<void>;
}
