import { Plugin } from "obsidian";
import CjsModuleLoader from "./loaders/cjsModuleLoader";
import * as obsidian from "obsidian";
import { SettingsManager, SettingTab } from "./settings/Settings";
import { Helpers } from "./helpers/Helpers";
import { Importer } from "./import/Importer";
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
    private importer: Importer;
    /**
     * Loads a JS module or CSS file from the vault or an http(s) URL.
     * ESM resolves to the module, CJS to module.exports, CSS to a StyleHandle.
     */
    import: Importer["import"];

    async onload() {
        this.settingsManager = new SettingsManager(this, await this.loadData());
        this.commonJsModuleLoader = new CjsModuleLoader(
            this,
            this.settingsManager.settings
        );

        this.passedModules = { obsidian };
        this.api = new Helpers(this.app);
        this.helpers = this.api;
        this.importer = new Importer(this.app);
        this.import = this.importer.import.bind(this.importer);
        this.registerEvent(
            this.app.workspace.on("window-open", (_, win) =>
                this.importer.windowOpened(win.document)
            )
        );
        this.registerEvent(
            this.app.workspace.on("window-close", (_, win) =>
                this.importer.windowClosed(win.document)
            )
        );
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

        // wait for vault files to load; the loader handles its own errors
        this.app.workspace.onLayoutReady(() =>
            this.commonJsModuleLoader.onload()
        );
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

    async onunload() {
        await this.commonJsModuleLoader.onunload();
        // after the scripts' own onunload, so they can still use plugin.import
        this.importer.unload();
    }
}
