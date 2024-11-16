import * as obsidian from "obsidian";
import { App, Notice, Plugin, PluginManifest, TFile } from "obsidian";
import UserPlugins from "src/main";
import { Settings } from "src/settings/Settings";
import { UserPluginError } from "src/settings/utils/Error";
import { resolve_tfile } from "src/settings/utils/Utils";
import { Loader } from "./loader";

interface UserCjsModule {
    exports?: {
        onload?: (plugin?: UserPlugins) => Promise<void>;
        onunload?: (plugin?: UserPlugins) => Promise<void>;
        default?: new (app: App, pluginManifest: PluginManifest) => Plugin;
    };
}

interface UserModule {
    onload: (plugin?: UserPlugins) => Promise<void>;
    onunload?: (plugin?: UserPlugins) => Promise<void>;
}

interface UserModuleOrPlugin {
    object: UserModule | Plugin;
    type: "module" | "plugin";
}

export default class CjsModuleLoader implements Loader {
    modulesWithUnload: Array<[string, UserModuleOrPlugin]> = [];
    app: obsidian.App;

    constructor(private plugin: UserPlugins, private settings: Settings) {
        this.app = plugin.app;
    }

    async onload() {
        try {
            await this.runJsModules();
            await this.runSnippets();
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(`Failed with error: ${e.message}`, e);
        }
    }

    async runSnippet(snippet: string, idx: number) {
        try {
            Function("plugin", "require", snippet)(this.plugin, require);
        } catch (e) {
            Error.captureStackTrace(e);
            new Notice(
                `obsidian-user-plugins: error running snippet no.${idx}`,
                5000
            );
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

    async runJsModule(path: string) {
        if (!path && path === "") {
            return;
        }
        let file: TFile;
        try {
            file = resolve_tfile(this.app, path);
        } catch (e) {
            if (e instanceof UserPluginError) {
                this.logError(`Error resolving file ${path}: ${e.message}`);
                new Notice("obsidian-user-plugins: " + e.message, 5000);
                return;
            }
            this.logError(`Error: ${e}`);
            return;
        }
        const userModule: UserCjsModule = {};
        try {
            Function(
                "module",
                "require",
                await this.app.vault.read(file)
            )(userModule, require);
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(
                `${file.path} evaluation error: ${e.message}`,
                e
            );
            new Notice(
                "obsidian-user-plugins: cannot evaluate: " + file.path,
                5000
            );
            return;
        }

        try {
            if (!userModule.exports) {
                console.log(
                    "[obsidian-user-plugins] no exports found in " + file.path
                );
                return;
            }
            if (userModule.exports.onload) {
                await userModule.exports.onload(this.plugin);
                if (userModule.exports.onunload) {
                    this.modulesWithUnload.push([
                        file.path,
                        {
                            type: "module",
                            object: {
                                onunload: userModule.exports.onunload,
                                onload: userModule.exports.onload,
                            },
                        },
                    ]);
                }
            } else if (userModule.exports.default) {
                const userPlugin = new userModule.exports.default(
                    this.app,
                    this.plugin.manifest
                );
                await userPlugin.onload();
                this.modulesWithUnload.push([
                    file.path,
                    { type: "plugin", object: userPlugin },
                ]);
            }
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(`${file.path}.onload error: ${e.message}`, e);
            new Notice(
                "obsidian-user-plugins: error in onload: " + file.path,
                5000
            );
            return;
        }
    }

    async runOnunload(path: string) {
        const toRemove: Array<number> = [];
        await Promise.all(
            this.modulesWithUnload
                .filter(([p, _]) => p === path)
                .map(async ([path, userModule], idx) => {
                    await this.runOnunloadOfUserModule(path, userModule);
                    toRemove.push(idx);
                })
        );

        toRemove
            .slice()
            .reverse()
            .forEach((idx) => this.modulesWithUnload.splice(idx, 1));
    }

    private async runJsModules() {
        for (const path of this.settings.enabledScripts) {
            await this.runJsModule(path);
        }
    }

    private logScriptError(msg: string, error: Error) {
        this.logError(`${msg}. stacktrace: ${error.stack}`);
    }

    private logError(msg: string) {
        console.error(`[obsidian-user-plugins] ${msg}`);
    }

    private async runOnunloadOfUserModule(
        path: string,
        userModule: UserModuleOrPlugin
    ) {
        try {
            if (userModule.object.onunload) {
                if (userModule.type === "plugin") {
                    await userModule.object.onunload();
                } else {
                    await userModule.object.onunload(this.plugin);
                }
            }
        } catch (e) {
            Error.captureStackTrace(e);
            this.logScriptError(
                `Error running ${path}.onunload: ${e.message}`,
                e
            );
            new Notice(
                "obsidian-user-plugins: error in onunload: " + path,
                5000
            );
        }
    }

    async onunload() {
        for (const [path, userModule] of this.modulesWithUnload) {
            await this.runOnunloadOfUserModule(path, userModule);
        }
    }
}
