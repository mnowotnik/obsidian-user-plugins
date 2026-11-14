import { App, normalizePath, requestUrl } from "obsidian";
import { evaluateCjs } from "src/loaders/evaluateCjs";

export type ImportType = "esm" | "cjs" | "css";

export interface ImportOptions {
    /** Expected SHA-256 of the file (hex). If it doesn't match, nothing runs. */
    sha256?: string;
    /** Overrides the type guessed from the file extension. */
    type?: ImportType;
    /** Load again even if this source was imported before. */
    fresh?: boolean;
}

/** Returned for CSS imports: the injected <style> element. */
export interface StyleHandle {
    el: HTMLStyleElement;
    remove(): void;
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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Loads JS modules and CSS from the vault or from http(s) URLs, optionally
 * checking a SHA-256 hash first. Each source is loaded once and shared.
 */
export class Importer {
    private cache = new Map<string, Promise<unknown>>();
    private styles = new Set<HTMLStyleElement>();

    constructor(private app: App) {}

    import(source: string, options: ImportOptions = {}): Promise<unknown> {
        let type: ImportType;
        try {
            type = options.type ?? typeOf(source);
        } catch (e) {
            return Promise.reject(e);
        }
        const key = `${type}\n${source}\n${options.sha256 ?? ""}`;
        if (!options.fresh) {
            const cached = this.cache.get(key);
            if (cached) return cached;
        }
        const loading = this.load(source, type, key, options.sha256);
        this.cache.set(key, loading);
        // don't cache failures, so fixing the file and retrying works
        loading.catch(() => {
            if (this.cache.get(key) === loading) this.cache.delete(key);
        });
        return loading;
    }

    /** Removes injected styles and forgets everything loaded. */
    unload() {
        this.styles.forEach((el) => el.remove());
        this.styles.clear();
        this.cache.clear();
    }

    private async load(
        source: string,
        type: ImportType,
        key: string,
        sha256?: string
    ): Promise<unknown> {
        const bytes = await this.read(source);
        if (sha256) {
            const actual = await sha256Hex(bytes);
            if (actual !== sha256.toLowerCase()) {
                throw new Error(
                    `${source} failed its integrity check (sha256 ${actual}); not loading it`
                );
            }
        }
        switch (type) {
            case "esm":
                return this.importEsm(bytes);
            case "cjs":
                return evaluateCjs(new TextDecoder().decode(bytes), source)
                    .exports;
            case "css":
                return this.injectCss(
                    new TextDecoder().decode(bytes),
                    source,
                    key
                );
        }
    }

    private async read(source: string): Promise<ArrayBuffer> {
        if (URL_RE.test(source)) {
            // requestUrl isn't subject to CORS and works on mobile
            return (await requestUrl({ url: source })).arrayBuffer;
        }
        return this.app.vault.adapter.readBinary(normalizePath(source));
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

    private injectCss(css: string, source: string, key: string): StyleHandle {
        const el = document.head.createEl("style", { text: css });
        el.dataset.userPluginsSource = source;
        this.styles.add(el);
        return {
            el,
            remove: () => {
                el.remove();
                this.styles.delete(el);
                this.cache.delete(key);
            },
        };
    }
}
