import { App, normalizePath, requestUrl } from "obsidian";
import { evaluateCjs } from "src/loaders/evaluateCjs";
import { errorMessage, logScriptError } from "src/utils/log";

export type ImportType = "esm" | "cjs" | "css";

const IMPORT_TYPES: readonly ImportType[] = ["esm", "cjs", "css"];

export interface ImportOptions {
    /**
     * Expected SHA-256 of the file (64 hex characters). If it doesn't match,
     * the import rejects; the file doesn't run unless another call already
     * loaded it (pass `fresh: true` to be sure).
     */
    sha256?: string;
    /** Overrides the type guessed from the file extension. */
    type?: ImportType;
    /** Load again even if this source was imported before. */
    fresh?: boolean;
}

/** Returned for CSS imports. */
export interface StyleHandle {
    /** The <style> element in the main window. */
    readonly el: HTMLStyleElement;
    /** Removes the style from every window. */
    remove(): void;
}

/** An imported stylesheet, present in every open window. */
interface Sheet {
    readonly id: string;
    readonly css: string;
    readonly source: string;
    readonly els: Map<Document, HTMLStyleElement>;
}

/** A validated, normalized import call. */
interface ImportRequest {
    readonly source: string;
    readonly type: ImportType;
    /** Expected hash (lower-case hex), or "" for none. */
    readonly sha256: string;
    readonly fresh: boolean;
    /** Cache key: one entry per type and source. */
    readonly key: string;
}

/** A loaded file: what import() resolves to, plus the hash of its bytes. */
interface Loaded {
    readonly value: unknown;
    readonly sha256: string;
}

const URL_RE = /^https?:\/\//i;

function extensionOf(source: string): string {
    const path = URL_RE.test(source) ? new URL(source).pathname : source;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function typeOf(source: string): ImportType {
    switch (extensionOf(source)) {
        case "js":
        case "mjs":
            return "esm";
        case "cjs":
            return "cjs";
        case "css":
            return "css";
        default:
            throw new Error(
                `Can't tell what kind of file ${source} is; pass { type: "esm" | "cjs" | "css" }`
            );
    }
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const OPTION_KEYS: readonly string[] = ["sha256", "type", "fresh"];

/** Validates input (which often comes from plain JS) into an ImportRequest. */
function toRequest(source: unknown, options: unknown): ImportRequest {
    if (typeof source !== "string" || !source) {
        throw new Error("plugin.import: source must be a vault path or URL");
    }
    if (
        options != null &&
        (typeof options !== "object" || Array.isArray(options))
    ) {
        throw new Error("plugin.import: options must be an object");
    }
    const opts = (options ?? {}) as Record<string, unknown>;
    // a misspelled option (e.g. "hash") must not silently skip a hash check
    const unknownKeys = Object.keys(opts).filter(
        (k) => !OPTION_KEYS.includes(k)
    );
    if (unknownKeys.length) {
        throw new Error(
            `plugin.import: unknown option ${unknownKeys.join(", ")}; use sha256, type or fresh`
        );
    }
    const { type, sha256, fresh } = opts;
    if (type != null && !IMPORT_TYPES.includes(type as ImportType)) {
        throw new Error(
            `plugin.import: unknown type "${type}"; use "esm", "cjs" or "css"`
        );
    }
    let hash = "";
    if (sha256 != null) {
        hash = typeof sha256 === "string" ? sha256.trim().toLowerCase() : "";
        if (!SHA256_RE.test(hash)) {
            throw new Error(
                "plugin.import: sha256 must be 64 hex characters (not an SRI \"sha256-...\" value)"
            );
        }
    }
    if (fresh != null && typeof fresh !== "boolean") {
        throw new Error("plugin.import: fresh must be true or false");
    }
    const resolvedType = (type as ImportType | null) ?? typeOf(source);
    const normalized = URL_RE.test(source) ? source : normalizePath(source);
    return {
        source: normalized,
        type: resolvedType,
        sha256: hash,
        fresh: fresh === true,
        key: `${resolvedType}\n${normalized}`,
    };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function integrityError(source: string, actual: string): Error {
    return new Error(
        `${source} failed its integrity check (sha256 ${actual}); not loading it`
    );
}

let nextSheetId = 0;

/**
 * Loads JS modules and CSS from the vault or from http(s) URLs, optionally
 * checking a SHA-256 hash first. Each source is loaded once and shared.
 */
export class Importer {
    /** What a plain (non-fresh) import of each key returns. */
    private readonly cache = new Map<string, Promise<Loaded>>();
    /**
     * The last load queued for each key. Loads of one key run one at a time,
     * in the order they were started, so the newest one is applied last.
     */
    private readonly queue = new Map<string, Promise<Loaded>>();
    /** The load queued directly after each load, and what it was asked for. */
    private readonly successor = new WeakMap<
        Promise<Loaded>,
        { loading: Promise<Loaded>; request: ImportRequest }
    >();
    /** The current stylesheet for each CSS cache key. */
    private readonly sheets = new Map<string, Sheet>();
    private readonly popouts = new Set<Document>();
    private disposed = false;

    constructor(private readonly app: App) {}

    /** Call on the workspace "window-open" event. */
    windowOpened(doc: Document) {
        if (this.disposed) return;
        this.popouts.add(doc);
        this.sheets.forEach((sheet) => this.addTo(sheet, doc));
    }

    /** Call on the workspace "window-close" event. */
    windowClosed(doc: Document) {
        this.popouts.delete(doc);
        this.sheets.forEach((sheet) => sheet.els.delete(doc));
    }

    import(
        source: string,
        options: ImportOptions & { type: "css" }
    ): Promise<StyleHandle>;
    /** For URLs with a query string, pass `type: "css"` to get a StyleHandle type. */
    import(
        source: `${string}.css`,
        options?: ImportOptions & { type?: "css" }
    ): Promise<StyleHandle>;
    /** `T` is not checked at runtime; it only types the result for you. */
    import<T = unknown>(source: string, options?: ImportOptions): Promise<T>;
    import(source: string, options?: ImportOptions): Promise<unknown> {
        let request: ImportRequest;
        try {
            this.throwIfDisposed();
            request = toRequest(source, options);
        } catch (e) {
            const label = typeof source === "string" ? source : typeof source;
            return this.logged(Promise.reject(e), label);
        }
        const { key } = request;
        const cached = this.cache.get(key);
        const loading = cached && !request.fresh ? cached : this.start(request);
        return this.logged(
            loading.then((loaded) => {
                // a shared load may have been started without (or with another) hash
                if (request.sha256 && loaded.sha256 !== request.sha256) {
                    throw new Error(
                        `${request.source} was already loaded and doesn't match the given sha256 (it is ${loaded.sha256})`
                    );
                }
                return loaded.value;
            }),
            request.source
        );
    }

    /** Queues a load after any load of the same key, and updates the cache. */
    private start(request: ImportRequest): Promise<Loaded> {
        const { key } = request;
        const previous = this.queue.get(key);
        const loading = previous
            ? previous.then(
                  () => this.load(request),
                  () => this.load(request)
              )
            : this.load(request);
        if (previous) this.successor.set(previous, { loading, request });
        this.queue.set(key, loading);
        // a fresh load replaces the cached one only once it succeeds
        if (!this.cache.has(key)) this.cache.set(key, loading);
        loading.then(
            () => {
                if (!this.disposed) this.cache.set(key, loading);
                if (this.queue.get(key) === loading) this.queue.delete(key);
            },
            () => {
                if (this.queue.get(key) === loading) this.queue.delete(key);
                if (this.cache.get(key) === loading) {
                    // hand plain imports to the load queued right after this
                    // one, so the file isn't loaded a second time, unless that
                    // load checks another caller's hash. Otherwise forget the
                    // failure, so retrying works.
                    const next = this.successor.get(loading);
                    if (next && !next.request.sha256) {
                        this.cache.set(key, next.loading);
                    } else {
                        this.cache.delete(key);
                    }
                }
            }
        );
        return loading;
    }

    /** Logs a failed import, so calls without await aren't silent. */
    private logged<T>(promise: Promise<T>, source: string): Promise<T> {
        promise.catch((e) => {
            if (this.disposed) return; // unloading, not a script error
            logScriptError(`import of ${source} failed: ${errorMessage(e)}`, e);
        });
        return promise;
    }

    /** Removes injected styles and forgets everything loaded. */
    unload() {
        this.disposed = true;
        this.sheets.forEach((sheet) => this.removeSheet(sheet));
        this.sheets.clear();
        this.cache.clear();
        this.queue.clear();
        this.popouts.clear();
    }

    private throwIfDisposed() {
        if (this.disposed) {
            throw new Error("plugin.import: User Plugins is unloaded");
        }
    }

    /** Reads, checks and evaluates a file. */
    private async load(request: ImportRequest): Promise<Loaded> {
        // a queued load may only start after the plugin was unloaded
        this.throwIfDisposed();
        const { source, type } = request;
        const bytes = await this.read(source);
        const sha256 = await sha256Hex(bytes);
        if (request.sha256 && sha256 !== request.sha256) {
            throw integrityError(source, sha256);
        }
        // the plugin may have been unloaded while reading
        this.throwIfDisposed();
        return { value: await this.evaluate(type, bytes, request), sha256 };
    }

    private async evaluate(
        type: ImportType,
        bytes: ArrayBuffer,
        request: ImportRequest
    ): Promise<unknown> {
        switch (type) {
            case "esm":
                return this.importEsm(bytes);
            case "cjs":
                return evaluateCjs(new TextDecoder().decode(bytes), request.source)
                    .exports;
            case "css":
                return this.injectCss(new TextDecoder().decode(bytes), request);
            default: {
                const unknownType: never = type;
                throw new Error(`Unknown import type ${unknownType}`);
            }
        }
    }

    private async read(source: string): Promise<ArrayBuffer> {
        if (URL_RE.test(source)) {
            // requestUrl isn't subject to CORS and works on mobile
            return (await requestUrl({ url: source })).arrayBuffer;
        }
        return this.app.vault.adapter.readBinary(source);
    }

    private async importEsm(bytes: ArrayBuffer): Promise<unknown> {
        const url = URL.createObjectURL(
            new Blob([bytes], { type: "text/javascript" })
        );
        try {
            return await import(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /** The main window plus every popout window that is open. */
    private openDocuments(): Set<Document> {
        const docs = new Set<Document>([document, ...this.popouts]);
        // popouts opened before this plugin loaded: each one holds a tab
        this.app.workspace.iterateAllLeaves((leaf) => {
            docs.add(leaf.getContainer().doc);
        });
        return docs;
    }

    /** Adds the sheet's <style> to a window, unless it's already there. */
    private addTo(sheet: Sheet, doc: Document): HTMLStyleElement {
        const existing =
            sheet.els.get(doc) ??
            // Obsidian may have copied the <style> into a new popout already
            doc.head.querySelector<HTMLStyleElement>(
                `style[data-user-plugins-sheet="${sheet.id}"]`
            );
        if (existing) {
            sheet.els.set(doc, existing);
            return existing;
        }
        const el = doc.createElement("style");
        el.textContent = sheet.css;
        el.dataset.userPluginsSource = sheet.source;
        el.dataset.userPluginsSheet = sheet.id;
        doc.head.appendChild(el);
        sheet.els.set(doc, el);
        return el;
    }

    private removeSheet(sheet: Sheet) {
        sheet.els.forEach((el) => el.remove());
        sheet.els.clear();
    }

    private injectCss(css: string, request: ImportRequest): StyleHandle {
        const { key, source } = request;
        const sheet: Sheet = {
            id: String(nextSheetId++),
            css,
            source,
            els: new Map(),
        };
        const el = this.addTo(sheet, document);
        this.openDocuments().forEach((doc) => this.addTo(sheet, doc));

        // a fresh import replaces the previous version of the same stylesheet
        const previous = this.sheets.get(key);
        if (previous) this.removeSheet(previous);
        this.sheets.set(key, sheet);

        return {
            el,
            remove: () => {
                this.removeSheet(sheet);
                // only forget the cache entry if it still belongs to this sheet
                if (this.sheets.get(key) === sheet) {
                    this.sheets.delete(key);
                    this.cache.delete(key);
                }
            },
        };
    }
}
