import { FileSystemAdapter, Plugin, TFile } from "obsidian";
import * as path from "path";
import { Helpers } from "./helpers/Helpers";
import { DEFAULT_SETTINGS, Settings, SettingTab } from "./settings/Settings";
import { resolve_tfile } from "./settings/utils/Utils";

export default class UserPlugins extends Plugin {
    settings: Settings;
    onunloadHandlers: Array<[string, (plugin: Plugin) => Promise<void>]> = [];
    helpers: Helpers;

    async runSnippets() {
        let count = 0;
        for (const script of this.settings.snippets) {
            try {
                Function("plugin", script)(this);
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(`Snippet no.${count}`, e.message, e.stack);
            }
            count++;
        }
    }

    async runScripts() {
        // can't find a way to use dynamic imports
        const req = window.require;
        for (const path of this.settings.enabledScripts) {
            if (!path && path === "") {
                continue;
            }
            const file = resolve_tfile(this.app, path);
            if (file.extension !== "js") {
                continue;
            }
            const scriptPath = this.resolveFilePath(file);
            if (scriptPath == null) {
                console.error(`Cannot execute script: ${file.path}`);
                continue;
            }

            let userModule: {
                onload: (plugin: Plugin) => Promise<void>;
                onunload?: (plugin: Plugin) => Promise<void>;
            };
            try {
                userModule = req(scriptPath);
                await userModule.onload(this);
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(`${file.path}.onload}`, e.message, e.stack);
            }
            if ("onunload" in userModule) {
                this.onunloadHandlers.push([
                    file.path,
                    (plugin) => userModule.onunload(plugin),
                ]);
            }
        }
    }

    async onload() {
        await this.loadSettings();
        this.helpers = new Helpers(this.app);

        // wait for vault files to load
        // FIXME maybe there's a better hook
        this.app.workspace.onLayoutReady(async () => {
            await this.runScripts()
            await this.runSnippets()
        });

        this.addSettingTab(new SettingTab(this.app, this));
    }

    logScriptError(script: string, msg: string, stack: string) {
        console.error(
            `Script ${script} failed with error: ${msg}. Stacktrace: ${stack}`
        );
    }

    async onunload() {
        for (const [path, handler] of this.onunloadHandlers) {
            try {
                await handler(this);
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(`${path}.onunload}`, e.message, e.stack);
            }
        }
    }

    resolveFilePath(file: TFile): string | null {
        const basePath = this.vaultBasePath();
        if (basePath == null) {
            return null;
        }
        return path.join(basePath, file.path);
    }

    vaultBasePath(): string | null {
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return adapter.getBasePath();
        }
        return null;
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
