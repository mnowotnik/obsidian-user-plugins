import { Plugin } from "obsidian";
import CjsModuleLoader from "./loaders/cjsModuleLoader";
import * as obsidian from "obsidian";
import { SettingsManager, SettingTab } from "./settings/Settings";
import { Helpers } from "./helpers/Helpers";

export default class UserPlugins extends Plugin {
    api: Helpers;
    /**
     * @deprecated
     */
    passedModules: Record<string, any>;
    /**
     * @deprecated
     */
    helpers: Helpers;
    private commonJsModuleLoader: CjsModuleLoader;
    private settingsManager: SettingsManager;

    async onload() {
        this.settingsManager = new SettingsManager(this, await this.loadData());
        this.commonJsModuleLoader = new CjsModuleLoader(
            this,
            this.settingsManager.settings
        );

        this.passedModules = { obsidian };
        this.helpers = new Helpers(this.app);
        this.api = new Helpers(this.app);
        this.addSettingTab(
            new SettingTab({
                settingsManager: this.settingsManager,
                cjsModuleRunner: this.commonJsModuleLoader,
                app: this.app,
                plugin: this,
            })
        );

        // wait for vault files to load
        // FIXME maybe there's a better hook
        this.app.workspace.onLayoutReady(async () => {
            try {
                await this.commonJsModuleLoader.onload();
            } catch (e) {
                Error.captureStackTrace(e);
                this.logScriptError(`Failed with error: ${e.message}`, e);
            }
        });
    }

    private logScriptError(msg: string, error: Error) {
        this.logError(`${msg}. stacktrace: ${error.stack}`);
    }

    private logError(msg: string) {
        console.error(`[obsidian-user-plugins] ${msg}`);
    }

    async onunload() {
        await this.commonJsModuleLoader.onunload();
    }
}
