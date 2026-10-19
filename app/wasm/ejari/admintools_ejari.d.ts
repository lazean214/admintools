/* tslint:disable */
/* eslint-disable */

export class PdfEditorDocument {
    free(): void;
    [Symbol.dispose](): void;
    add_image(page: number, rgba: Uint8Array, width: number, height: number, x: number, y: number, draw_width: number, draw_height: number): void;
    add_link(page: number, x: number, y: number, width: number, height: number, url: string): void;
    add_path(page: number, points: Float64Array, color: Float64Array, stroke: number): void;
    add_shape(page: number, x: number, y: number, width: number, height: number, color: Float64Array, opacity: number, stroke: number, kind: number): void;
    add_text(page: number, bytes: Uint8Array, x: number, y: number, size: number, bold: boolean, color: Float64Array): void;
    /**
     * Reconstruct a page without retaining its scanned bitmap or original text.
     */
    clear_page(page: number): void;
    finish(order: Uint32Array, rotations: Uint32Array): Uint8Array;
    inspect(page: number): string;
    constructor(bytes: Uint8Array);
    replace_image(page: number, name: string, rgba: Uint8Array, width: number, height: number): void;
    replace_text(page: number, index: number, expected: string, replacement: string): void;
}

/**
 * A viewer-compatible export: three US Letter pages at 144 dpi. The browser
 * renders template artwork and values together; the PDF contains RGB images,
 * so it does not depend on text-layer/font support in the reader.
 */
export function create_ejari_raster(rgba: Uint8Array): Uint8Array;

export function ejari_probe(template: Uint8Array): number;

/**
 * Compatibility proof only. The app continues using its established exporter
 * until field overlays and rendered equivalence have also been verified.
 */
export function ejari_roundtrip(template: Uint8Array): Uint8Array;

/**
 * Append bounded WinAnsi text overlays to the pinned template. Text is always
 * hex encoded, never interpreted as PDF operators. Coordinates are millimetres
 * in the existing form mapping, before its fixed 20/35 mm alignment offset.
 */
export function fill_ejari(template: Uint8Array, text: Uint8Array, offsets: Uint32Array, placements: Float64Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_pdfeditordocument_free: (a: number, b: number) => void;
    readonly create_ejari_raster: (a: number, b: number) => [number, number, number, number];
    readonly ejari_probe: (a: number, b: number) => [number, number, number];
    readonly ejari_roundtrip: (a: number, b: number) => [number, number, number, number];
    readonly fill_ejari: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly pdfeditordocument_add_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly pdfeditordocument_add_link: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly pdfeditordocument_add_path: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly pdfeditordocument_add_shape: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly pdfeditordocument_add_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly pdfeditordocument_clear_page: (a: number, b: number) => [number, number];
    readonly pdfeditordocument_finish: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly pdfeditordocument_inspect: (a: number, b: number) => [number, number, number, number];
    readonly pdfeditordocument_new: (a: number, b: number) => [number, number, number];
    readonly pdfeditordocument_replace_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly pdfeditordocument_replace_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
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
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
