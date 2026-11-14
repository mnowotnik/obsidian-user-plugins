import { App, Notice, Plugin, PluginManifest, TFile } from "obsidian";
import UserPlugins from "src/main";
import { Settings } from "src/settings/Settings";
import { UserPluginError } from "src/utils/Error";
import { getFile } from "src/utils/vault";
import { errorMessage, logError, logScriptError } from "src/utils/log";
import { Loader } from "./loader";

interface UserCjsModule {
    exports: {
        onload?: (plugin?: UserPlugins) => Promise<void>;
        onunload?: (plugin?: UserPlugins) => Promise<void>;
        default?: new (app: App, pluginManifest: PluginManifest) => Plugin;
    };
}

interface UserModule {
    onunload: (plugin?: UserPlugins) => Promise<void>;
}

type UserModuleOrPlugin =
    | { type: "module"; object: UserModule }
    | { type: "plugin"; object: Plugin };

export default class CjsModuleLoader implements Loader {
    modulesWithUnload: Array<[string, UserModuleOrPlugin]> = [];
    app: App;

    constructor(private plugin: UserPlugins, private settings: Settings) {
        this.app = plugin.app;
    }

    async onload() {
        try {
            await this.runJsModules();
            await this.runSnippets();
        } catch (e) {
            logScriptError(`Failed with error: ${errorMessage(e)}`, e);
        }
    }

    async runSnippet(snippet: string, idx: number) {
        try {
            Function("plugin", "require", snippet)(this.plugin, require);
        } catch (e) {
            new Notice(
                `obsidian-user-plugins: error running snippet no.${idx}`,
                5000
            );
            logScriptError(
                `Error running snippet no.${idx}: ${errorMessage(e)}`,
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
        if (!path) {
            return;
        }
        let file: TFile;
        try {
            file = getFile(this.app, path);
        } catch (e) {
            if (e instanceof UserPluginError) {
                logError(`Error resolving file ${path}: ${e.message}`);
                new Notice("obsidian-user-plugins: " + e.message, 5000);
                return;
            }
            logError(`Error: ${e}`);
            return;
        }
        const userModule: UserCjsModule = { exports: {} };
        try {
            const source = await this.app.vault.read(file);
            // sourceURL makes stack traces and devtools show the vault path
            Function(
                "module",
                "exports",
                "require",
                `${source}\n//# sourceURL=${file.path}`
            )(userModule, userModule.exports, require);
        } catch (e) {
            logScriptError(
                `${file.path} evaluation error: ${errorMessage(e)}`,
                e
            );
            new Notice(
                "obsidian-user-plugins: cannot evaluate: " + file.path,
                5000
            );
            return;
        }

        const exports = userModule.exports;
        try {
            if (exports?.onload) {
                await exports.onload(this.plugin);
                if (exports.onunload) {
                    this.modulesWithUnload.push([
                        file.path,
                        {
                            type: "module",
                            object: { onunload: exports.onunload },
                        },
                    ]);
                }
            } else if (exports?.default) {
                const userPlugin = new exports.default(
                    this.app,
                    this.plugin.manifest
                );
                await userPlugin.onload();
                this.modulesWithUnload.push([
                    file.path,
                    { type: "plugin", object: userPlugin },
                ]);
            } else {
                console.log(
                    "[obsidian-user-plugins] no onload or default export found in " +
                        file.path
                );
            }
        } catch (e) {
            logScriptError(
                `${file.path}.onload error: ${errorMessage(e)}`,
                e
            );
            new Notice(
                "obsidian-user-plugins: error in onload: " + file.path,
                5000
            );
        }
    }

    async runOnunload(path: string) {
        const toUnload = this.modulesWithUnload.filter(([p]) => p === path);
        this.modulesWithUnload = this.modulesWithUnload.filter(
            ([p]) => p !== path
        );
        await Promise.all(
            toUnload.map(([p, userModule]) =>
                this.runOnunloadOfUserModule(p, userModule)
            )
        );
    }

    private async runJsModules() {
        for (const path of this.settings.enabledScripts) {
            await this.runJsModule(path);
        }
    }

    private async runOnunloadOfUserModule(
        path: string,
        userModule: UserModuleOrPlugin
    ) {
        try {
            if (userModule.type === "plugin") {
                await userModule.object.onunload();
            } else {
                await userModule.object.onunload(this.plugin);
            }
        } catch (e) {
            logScriptError(
                `Error running ${path}.onunload: ${errorMessage(e)}`,
                e
            );
            new Notice(
                "obsidian-user-plugins: error in onunload: " + path,
                5000
            );
        }
    }

    async onunload() {
        const modules = this.modulesWithUnload;
        this.modulesWithUnload = [];
        for (const [path, userModule] of modules) {
            await this.runOnunloadOfUserModule(path, userModule);
        }
    }
}
