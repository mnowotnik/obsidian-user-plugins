import { App, normalizePath, requestUrl } from "obsidian";
import { evaluateCjs } from "src/loaders/evaluateCjs";
import { errorMessage, logScriptError } from "src/utils/log";

export type ImportType = "esm" | "cjs" | "css";

const IMPORT_TYPES: readonly ImportType[] = ["esm", "cjs", "css"];

export interface ImportOptions {
    /** Expected SHA-256 of the file (hex). If it doesn't match, nothing runs. */
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
interface Request {
    readonly source: string;
    readonly type: ImportType;
    readonly sha256: string;
    readonly key: string;
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

/** Validates input (which often comes from plain JS) into a Request. */
function toRequest(source: unknown, options: ImportOptions): Request {
    if (typeof source !== "string" || !source) {
        throw new Error("plugin.import: source must be a vault path or URL");
    }
    if (options.type !== undefined && !IMPORT_TYPES.includes(options.type)) {
        throw new Error(
            `plugin.import: unknown type "${options.type}"; use "esm", "cjs" or "css"`
        );
    }
    const type = options.type ?? typeOf(source);
    const normalized = URL_RE.test(source) ? source : normalizePath(source);
    const sha256 = (options.sha256 ?? "").trim().toLowerCase();
    return {
        source: normalized,
        type,
        sha256,
        key: `${type}\n${normalized}\n${sha256}`,
    };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

let nextSheetId = 0;

/**
 * Loads JS modules and CSS from the vault or from http(s) URLs, optionally
 * checking a SHA-256 hash first. Each source is loaded once and shared.
 */
export class Importer {
    private readonly cache = new Map<string, Promise<unknown>>();
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
    import(
        source: `${string}.css`,
        options?: ImportOptions & { type?: "css" }
    ): Promise<StyleHandle>;
    import<T = unknown>(source: string, options?: ImportOptions): Promise<T>;
    import(source: string, options?: ImportOptions): Promise<unknown> {
        let request: Request;
        try {
            this.throwIfDisposed();
            request = toRequest(source, options ?? {});
        } catch (e) {
            return Promise.reject(e);
        }
        const { key } = request;
        const cached = this.cache.get(key);
        if (cached && !options?.fresh) return cached;

        const loading = this.load(request);
        // a fresh load replaces a cached one only once it succeeds
        if (!cached) this.cache.set(key, loading);
        loading.then(
            () => {
                if (!this.disposed) this.cache.set(key, loading);
            },
            (e) => {
                // don't cache failures, so fixing the file and retrying works
                if (this.cache.get(key) === loading) this.cache.delete(key);
                logScriptError(
                    `import of ${request.source} failed: ${errorMessage(e)}`,
                    e
                );
            }
        );
        return loading;
    }

    /** Removes injected styles and forgets everything loaded. */
    unload() {
        this.disposed = true;
        this.sheets.forEach((sheet) => this.removeSheet(sheet));
        this.sheets.clear();
        this.cache.clear();
        this.popouts.clear();
    }

    private throwIfDisposed() {
        if (this.disposed) {
            throw new Error("plugin.import: User Plugins is unloaded");
        }
    }

    private async load(request: Request): Promise<unknown> {
        const { source, type, sha256 } = request;
        const bytes = await this.read(source);
        if (sha256) {
            const actual = await sha256Hex(bytes);
            if (actual !== sha256) {
                throw new Error(
                    `${source} failed its integrity check (sha256 ${actual}); not loading it`
                );
            }
        }
        // the plugin may have been unloaded while reading
        this.throwIfDisposed();
        switch (type) {
            case "esm":
                return this.importEsm(bytes);
            case "cjs":
                return evaluateCjs(new TextDecoder().decode(bytes), source)
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

    private injectCss(css: string, request: Request): StyleHandle {
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
