/* tslint:disable */
/* eslint-disable */

export function composite_rgba(base: Uint8Array, width: number, height: number, mark: Uint8Array, mark_width: number, mark_height: number, x: number, y: number, opacity: number): Uint8Array;

export function create_raster_pdf(rgba: Uint8Array, width: number, height: number, page_width: number, page_height: number): Uint8Array;

export function remove_watermark(rgba: Uint8Array, mask: Uint8Array, width: number, height: number, seed: number, progress: Function): Uint8Array;

export function resize_rgba(rgba: Uint8Array, width: number, height: number, target_width: number, target_height: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly composite_rgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
    readonly create_raster_pdf: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly remove_watermark: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any) => [number, number, number, number];
    readonly resize_rgba: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
