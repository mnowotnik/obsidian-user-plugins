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

    async runSnippets() {
        let count = 0;
        for (const script of this.settings.snippets) {
            try {
                Function("plugin", script)(this);
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(
                    `Error running snippet no.${count}: ${e.message}`,
                    e
                );
            }
            count++;
        }
    }

    async runScripts() {
        for (const path of this.settings.enabledScripts) {
            if (!path && path === "") {
                continue;
            }
            let file: TFile;
            try {
                file = resolve_tfile(this.app, path);
            } catch (e) {
                if (e instanceof UserPluginError) {
                    this.logError(`Error resolving file ${path}: ${e.message}`);
                    continue;
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
                continue;
            }

            try {
                if ("onload" in userModule.exports) {
                    await userModule.exports.onload(this);
                }
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(
                    `${file.path}.onload error: ${e.message}`,
                    e
                );
                continue;
            }
            if ("onunload" in userModule.exports) {
                this.modulesWithUnload.push([file.path, userModule]);
            }
        }
    }

    logScriptError(msg: string, error: Error) {
        this.logError(`${msg}. stacktrace: ${error.stack}`);
    }

    logError(msg: string) {
        console.error(`[obsidian-user-plugins] ${msg}`);
    }

    async onunload() {
        for (const [path, userModule] of this.modulesWithUnload) {
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
