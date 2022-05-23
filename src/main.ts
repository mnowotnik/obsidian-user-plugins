import { Plugin, TFile } from "obsidian";
import { Helpers } from "./helpers/Helpers";
import { DEFAULT_SETTINGS, Settings, SettingTab } from "./settings/Settings";
import { resolve_tfile } from "./settings/utils/Utils";
import * as obsidian from "obsidian";
import { UserPluginError } from "./settings/utils/Error";

interface UserModule {
    exports?: {
        onload: (plugin: Plugin) => Promise<void>;
        onunload?: (plugin: Plugin) => Promise<void>;
    };
}

export default class UserPlugins extends Plugin {
    settings: Settings;
    modulesWithUnload: Array<[string, UserModule]> = [];
    passedModules: Record<string, object>;
    helpers: Helpers;

    async onload() {
        await this.loadSettings();
        this.passedModules = {
            obsidian: obsidian,
        };
        this.helpers = new Helpers(this.app);

        // wait for vault files to load
        // FIXME maybe there's a better hook
        this.app.workspace.onLayoutReady(async () => {
            try {
                await this.runScripts();
                await this.runSnippets();
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(`Failed with error: ${e.message}`, e);
            }
        });

        this.addSettingTab(new SettingTab(this.app, this));
    }

    async runSnippet(snippet: string, idx: number) {
        try {
            Function("plugin", snippet)(this);
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(
                `Error running snippet no.${idx}: ${e.message}`,
                e
            );
        }
    }

    async runSnippets() {
        let count = 0;
        for (const script of this.settings.snippets) {
            await this.runSnippet(script, count);
            count++;
        }
    }

    async runScript(path: string) {
        if (!path && path === "") {
            return;
        }
        let file: TFile;
        try {
            file = resolve_tfile(this.app, path);
        } catch (e) {
            if (e instanceof UserPluginError) {
                this.logError(`Error resolving file ${path}: ${e.message}`);
                return;
            }
        }
        const userModule: UserModule = {};
        try {
            Function("module", await this.app.vault.read(file))(userModule);
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(
                `${file.path} evaluation error: ${e.message}`,
                e
            );
            return;
        }

        try {
            if ("onload" in userModule.exports) {
                await userModule.exports.onload(this);
            }
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(`${file.path}.onload error: ${e.message}`, e);
            return;
        }
        if ("onunload" in userModule.exports) {
            this.modulesWithUnload.push([file.path, userModule]);
        }
    }

    async runOnunload(path: string) {
        const toRemove: Array<number> = [];
        await Promise.all(
            this.modulesWithUnload
                .filter(([p, _]) => p === path)
                .map(async ([path, userModule], idx) => {
                    await this.runOnUnloadOfUserModule(path, userModule);
                    toRemove.push(idx);
                })
        );

        toRemove
            .slice()
            .reverse()
            .forEach((idx) => this.modulesWithUnload.splice(idx, 1));
    }

    async runScripts() {
        for (const path of this.settings.enabledScripts) {
            await this.runScript(path);
        }
    }

    logScriptError(msg: string, error: Error) {
        this.logError(`${msg}. stacktrace: ${error.stack}`);
    }

    logError(msg: string) {
        console.error(`[obsidian-user-plugins] ${msg}`);
    }

    private async runOnUnloadOfUserModule(
        path: string,
        userModule: UserModule
    ) {
        try {
            await userModule.exports.onunload(this);
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(
                `Error running ${path}.onunload: ${e.message}`,
                e
            );
        }
    }

    async onunload() {
        for (const [path, userModule] of this.modulesWithUnload) {
            await this.runOnUnloadOfUserModule(path, userModule);
        }
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
