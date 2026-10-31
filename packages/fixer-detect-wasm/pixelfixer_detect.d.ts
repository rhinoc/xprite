/* tslint:disable */
/* eslint-disable */

export class DetectResult {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  cols: number;
  consensus: string;
  rows: number;
  step_x: number;
  step_y: number;
}

export function detectFastAcRl(rgba: Uint8Array, w: number, h: number): DetectResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_detectresult_free: (a: number, b: number) => void;
  readonly __wbg_get_detectresult_cols: (a: number) => number;
  readonly __wbg_get_detectresult_consensus: (a: number) => [number, number];
  readonly __wbg_get_detectresult_rows: (a: number) => number;
  readonly __wbg_get_detectresult_step_x: (a: number) => number;
  readonly __wbg_get_detectresult_step_y: (a: number) => number;
  readonly __wbg_set_detectresult_cols: (a: number, b: number) => void;
  readonly __wbg_set_detectresult_consensus: (a: number, b: number, c: number) => void;
  readonly __wbg_set_detectresult_rows: (a: number, b: number) => void;
  readonly __wbg_set_detectresult_step_x: (a: number, b: number) => void;
  readonly __wbg_set_detectresult_step_y: (a: number, b: number) => void;
  readonly detectFastAcRl: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
