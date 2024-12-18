import { App, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import CjsModuleLoader from "src/loaders/cjsModuleLoader";
import UserPlugins from "../main";
import FolderSuggester from "./suggesters/FolderSuggester";
import { get_tfiles_from_folder } from "./utils/Utils";

export interface Settings {
    snippets: Array<string>;
    scriptsFolder: string;
    enabledScripts: Array<string>;
}

export const DEFAULT_SETTINGS: Settings = {
    snippets: [""],
    scriptsFolder: "",
    enabledScripts: [""],
};

export class SettingsManager {
    settings: Settings;
    constructor(private plugin: UserPlugins, pluginData: any) {
        this.loadSettings(pluginData);
    }

    private async loadSettings(pluginData: any) {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, pluginData);
    }

    async saveSettings() {
        await this.plugin.saveData(this.settings);
    }
}

interface Args {
    app: App;
    plugin: UserPlugins;
    settingsManager: SettingsManager;
    cjsModuleRunner: CjsModuleLoader;
}

export class SettingTab extends PluginSettingTab {
    cjsModuleRunner: CjsModuleLoader;
    settingsManager: SettingsManager;

    constructor({ app, plugin, settingsManager, cjsModuleRunner }: Args) {
        super(app, plugin);
        this.cjsModuleRunner = cjsModuleRunner;
        this.settingsManager = settingsManager;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.addScriptFolderSetting();
        this.addUserScriptsListSetting();
        this.addSnippetsSetting();
    }

    addUserScriptsListSetting(): void {
        if (!this.settingsManager.settings.scriptsFolder) {
            new Setting(this.containerEl)
                .setName("No user scripts folder set")
                .addExtraButton((extra) => {
                    extra
                        .setIcon("sync")
                        .setTooltip("Refresh")
                        .onClick(() => {
                            this.display();
                        });
                });
            return;
        }
        let name: string;
        let files: Array<TFile> = [];
        try {
            files = get_tfiles_from_folder(
                this.app,
                this.settingsManager.settings.scriptsFolder
            );
            files = files.filter(
                (f) => f.path.contains("node_modules") == false
            );
        } catch (e) {
            console.error(`Failed to read user scripts folder: ${e.message}`);
            new Notice("Failed to read user scripts folder");
        }

        if (files.length == 0) {
            name = "No user scripts found";
        } else {
            const added = this.addUserScriptEntries(files);
            if (added == 0) {
                name = "No user scripts found";
            } else {
                name = `Found ${added} user scripts`;
            }
        }

        new Setting(this.containerEl).setName(name).addExtraButton((extra) => {
            extra
                .setIcon("sync")
                .setTooltip("Refresh")
                .onClick(() => {
                    this.display();
                });
        });
    }

    addUserScriptEntries(files: Array<TFile>): number {
        let added = 0;
        const enabled = this.settingsManager.settings.enabledScripts;
        const absentFilesToRemove = [...enabled];
        for (const file of files) {
            if (file.extension === "js") {
                new Setting(this.containerEl)
                    .setName(file.name)
                    .setDesc("Enable this script")
                    .addToggle((cb) => {
                        cb.setValue(enabled.includes(file.path)).onChange(
                            (newValue) => {
                                const idx = enabled.indexOf(file.path);
                                if (newValue && idx == -1) {
                                    enabled.push(file.path);
                                } else if (!newValue && idx > -1) {
                                    enabled.splice(idx, 1);
                                }
                                this.settingsManager.saveSettings();
                                this.display();
                                if (newValue) {
                                    this.cjsModuleRunner.runJsModule(file.path);
                                } else {
                                    this.cjsModuleRunner.runOnunload(file.path);
                                }
                            }
                        );
                    });
                added++;
            }
            if (enabled.includes(file.path)) {
                absentFilesToRemove.remove(file.path);
            }
        }
        if (absentFilesToRemove.length > 0) {
            for (const file of absentFilesToRemove) {
                enabled.remove(file);
            }
            this.settingsManager.saveSettings();
        }
        return added;
    }

    addSnippetsSetting(): void {
        const { containerEl } = this;
        containerEl.createEl("h2", { text: "Snippets" });

        const scripts = this.settingsManager.settings.snippets;
        this.settingsManager.settings.snippets.forEach((_, idx) => {
            const setting = new Setting(this.containerEl)
                .addExtraButton((extra) => {
                    extra
                        .setIcon("right-arrow")
                        .setTooltip("Run snippet")
                        .onClick(() => {
                            const script = scripts[idx];
                            this.cjsModuleRunner.runSnippet(script, idx);
                        });
                })
                .addTextArea((text) => {
                    const t = text
                        .setPlaceholder("User script")
                        .setValue(scripts[idx])
                        .onChange((new_script) => {
                            const script = scripts[idx];
                            const index =
                                this.settingsManager.settings.snippets.indexOf(
                                    script
                                );
                            if (index > -1) {
                                this.settingsManager.settings.snippets[index] =
                                    new_script;
                                this.settingsManager.saveSettings();
                            }
                        });

                    t.inputEl.setAttr("rows", 5);
                    t.inputEl.addClass("obsidian_user_plugins_snippet");
                    return t;
                })
                .addExtraButton((extra) => {
                    extra
                        .setIcon("cross")
                        .setTooltip("Delete")
                        .onClick(() => {
                            const script = scripts[idx];
                            const index =
                                this.settingsManager.settings.snippets.indexOf(
                                    script
                                );
                            if (index > -1) {
                                this.settingsManager.settings.snippets.splice(
                                    index,
                                    1
                                );
                                this.settingsManager.saveSettings();
                                this.display();
                            }
                        });
                });
            setting.infoEl.remove();
        });
        const setting = new Setting(this.containerEl).addButton((button) => {
            button
                .setButtonText("Add new user script")
                .setCta()
                .onClick(() => {
                    this.settingsManager.settings.snippets.push("");
                    this.settingsManager.saveSettings();
                    this.display();
                });
        });
        setting.infoEl.remove();
    }

    addScriptFolderSetting(): void {
        this.containerEl.createEl("h2", { text: "Scripts" });
        new Setting(this.containerEl)
            .setName("Scripts folder location")
            .setDesc("Files in this folder can be run on Obsidian startup")
            .addSearch((cb) => {
                new FolderSuggester(this.app, cb.inputEl);
                cb.setPlaceholder("Ex.: Folder/MyScripts")
                    .setValue(this.settingsManager.settings.scriptsFolder)
                    .onChange((newFolder) => {
                        this.settingsManager.settings.scriptsFolder = newFolder;
                        this.settingsManager.saveSettings();
                    });
            });
    }
}
