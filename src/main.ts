import { Plugin } from "obsidian";
import CjsModuleLoader from "./loaders/cjsModuleLoader";
import * as obsidian from "obsidian";
import { SettingsManager, SettingTab } from "./settings/Settings";
import { Helpers } from "./helpers/Helpers";
import {
    PALETTE_COMMAND_ID,
    UserPluginsCommandPalette,
} from "./palette/CommandPalette";

const RIBBON_ICON = "plug-zap";

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
    private ribbonIconEl: HTMLElement | null = null;

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

        this.addCommand({
            id: PALETTE_COMMAND_ID,
            name: "Open command palette",
            callback: () => this.openCommandPalette(),
        });
        this.setRibbonIcon(this.settingsManager.settings.ribbonIconEnabled);

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

    openCommandPalette() {
        new UserPluginsCommandPalette(this.app, this).open();
    }

    setRibbonIcon(enabled: boolean) {
        if (enabled && !this.ribbonIconEl) {
            this.ribbonIconEl = this.addRibbonIcon(
                RIBBON_ICON,
                "User Plugins",
                () => this.openCommandPalette()
            );
        } else if (!enabled && this.ribbonIconEl) {
            this.ribbonIconEl.remove();
            this.ribbonIconEl = null;
        }
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
