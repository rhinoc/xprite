import {
  PayloadKind,
  ProjectStorageError,
  type PayloadStore,
} from "$/adapters/storage/project-storage/types";
import { OpfsByteStore, supportsOpfs } from "@xprite/bedrock/browser/opfs";
import { BrowserStorageError } from "@xprite/bedrock/browser/storage-error";

export { supportsOpfs };

/** Adapts the generic OPFS byte store to project-storage error semantics. */
export class OpfsPayloadStore implements PayloadStore {
  readonly kind = PayloadKind.Opfs;
  private readonly store: OpfsByteStore;

  constructor(namespace?: string, workerFactory?: () => Worker) {
    this.store = new OpfsByteStore(namespace, workerFactory);
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    return operation().catch((error: unknown) => {
      if (error instanceof BrowserStorageError)
        throw new ProjectStorageError(error.code, error.message);
      throw error;
    });
  }

  write(id: string, bytes: Uint8Array): Promise<void> {
    return this.run(() => this.store.write(id, bytes));
  }

  read(id: string): Promise<Uint8Array> {
    return this.run(() => this.store.read(id));
  }

  remove(id: string): Promise<void> {
    return this.run(() => this.store.remove(id));
  }

  close(): void {
    this.store.close();
  }
}
