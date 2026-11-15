/**
 * Types for User Plugins (obsidian-user-plugins), for type-checking and
 * completion in user scripts. This module only has types:
 * `require("obsidian-user-plugins")` doesn't work at runtime. Use them in
 * JSDoc: put `@type {import("obsidian-user-plugins").UserModule}` above
 * `module.exports = { ... }`, or
 * `@param {import("obsidian-user-plugins").UserPlugins} plugin` above a
 * function.
 *
 * src/typings/check.ts in the plugin's source checks these against the code.
 */
import { PaneType, Plugin, SplitDirection, TFile } from "obsidian";

/** Helper functions, available as `plugin.api`. */
export interface Helpers {
    /**
     * Opens a fuzzy-search modal and resolves to the item the user picks.
     * Rejects with "Modal cancelled" if the modal is closed without a pick.
     * @param itemLabels - a label for each item (same order as `items`), or
     *   a function that returns an item's label
     * @param placeholder - placeholder text of the search input
     * @param limit - how many matches are shown at most (default 20)
     */
    suggest<T>(
        itemLabels: string[] | ((item: T) => string),
        items: T[],
        placeholder?: string,
        limit?: number
    ): Promise<T>;
    /** Shows a Notice for `time` milliseconds (default 5000). */
    notify(message: string, time?: number): void;
    /** Paths of all folders in the vault, including the root ("/"). */
    getAllFolders(): string[];
    /**
     * Opens a file in a leaf.
     * @param params.paneType - where to open it; defaults to the active leaf
     *   ("tab" if `openInNewTab` is set)
     * @param params.direction - split direction, for `paneType: "split"`
     * @param params.mode - view mode to open the file in
     * @param params.focus - focus the leaf after opening
     */
    openFile(
        file: TFile,
        params?: {
            paneType?: PaneType;
            openInNewTab?: boolean;
            direction?: SplitDirection;
            mode?: "source" | "preview" | "default";
            focus?: boolean;
        }
    ): Promise<void>;
}

/** How `plugin.import` loads a file. */
export type ImportType = "esm" | "cjs" | "css";

export interface ImportOptions {
    /**
     * Expected SHA-256 of the file (64 hex characters). If it doesn't match,
     * the import rejects; the file doesn't run unless another call already
     * loaded it (pass `fresh: true` to be sure). If the key is present it
     * must hold a hash: omit it rather than passing undefined.
     */
    sha256?: string;
    /**
     * Overrides the type guessed from the file extension (.js and .mjs are
     * "esm", .cjs is "cjs", .css is "css").
     */
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

/**
 * The User Plugins plugin: the `plugin` passed to a module script's
 * `onload`/`onunload`, and what
 * `app.plugins.getPlugin("obsidian-user-plugins")` returns. Commands, events
 * and other things your scripts register on it are cleaned up when User
 * Plugins unloads.
 */
export interface UserPlugins extends Plugin {
    /** Helper functions. */
    api: Helpers;
    /** @deprecated Use `plugin.api`. */
    helpers: Helpers;
    /** @deprecated Use `require("obsidian")`. */
    passedModules: Record<string, unknown>;
    /**
     * Loads a JS module or CSS file from the vault (a vault path) or an
     * http(s) URL. Each source is loaded once and shared, unless
     * `fresh: true`. ESM resolves to the module namespace, CJS to
     * `module.exports`, CSS to a StyleHandle.
     */
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
    /** Opens the palette of commands registered by your scripts and snippets. */
    openCommandPalette(): void;
    /** Shows or hides the plugin's ribbon button. */
    setRibbonIcon(enabled: boolean): void;
    /**
     * Writes these typings and a jsconfig.json into the scripts folder, like
     * the "Set up editor support" command.
     */
    setUpEditorSupport(): Promise<void>;
}

/**
 * What a module-type script assigns to `module.exports`. Both functions get
 * the User Plugins plugin; `onunload` runs when the script is disabled or
 * User Plugins unloads.
 */
export interface UserModule {
    onload?(plugin: UserPlugins): void | Promise<void>;
    onunload?(plugin: UserPlugins): void | Promise<void>;
}

declare module "obsidian" {
    interface App {
        /** Not part of the public Obsidian API. */
        plugins: {
            /** Scripts only run while User Plugins is enabled. */
            getPlugin(id: "obsidian-user-plugins"): UserPlugins;
            getPlugin(id: string): Plugin | null;
        };
    }
}
