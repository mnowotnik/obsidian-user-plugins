import { App, PluginSettingTab, Setting, TFile } from "obsidian";
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

export class SettingTab extends PluginSettingTab {
    plugin: UserPlugins;

    constructor(app: App, plugin: UserPlugins) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.addScriptFolderSetting();
        this.addUserScriptsListSetting();
        this.addSnippetsSetting();
    }

    addUserScriptsListSetting(): void {
        if (!this.plugin.settings.scriptsFolder) {
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
        let files: Array<TFile>;
        try {
            files = get_tfiles_from_folder(
                this.app,
                this.plugin.settings.scriptsFolder
            );
        } catch (e) {
            console.error(`Failed to read user scripts folder: ${e.message}`);
        }

        if (!files || files.length == 0) {
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
        const enabled = this.plugin.settings.enabledScripts;
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
                                this.plugin.saveSettings();
                                this.display();
                                if (newValue) {
                                    this.plugin.runScript(file.path);
                                } else {
                                    this.plugin.runOnunload(file.path);
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
            this.plugin.saveSettings();
        }
        return added;
    }

    addSnippetsSetting(): void {
        const { containerEl } = this;
        containerEl.createEl("h2", { text: "Snippets" });

        const scripts = this.plugin.settings.snippets;
        this.plugin.settings.snippets.forEach((_, idx) => {
            const setting = new Setting(this.containerEl)
                .addExtraButton((extra) => {
                    extra
                        .setIcon("right-arrow")
                        .setTooltip("Run snippet")
                        .onClick(() => {
                            const script = scripts[idx];
                            this.plugin.runSnippet(script, idx);
                        });
                })
                .addTextArea((text) => {
                    const t = text
                        .setPlaceholder("User script")
                        .setValue(scripts[idx])
                        .onChange((new_script) => {
                            const script = scripts[idx];
                            const index =
                                this.plugin.settings.snippets.indexOf(script);
                            if (index > -1) {
                                this.plugin.settings.snippets[index] =
                                    new_script;
                                this.plugin.saveSettings();
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
                                this.plugin.settings.snippets.indexOf(script);
                            if (index > -1) {
                                this.plugin.settings.snippets.splice(index, 1);
                                this.plugin.saveSettings();
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
                    this.plugin.settings.snippets.push("");
                    this.plugin.saveSettings();
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
                    .setValue(this.plugin.settings.scriptsFolder)
                    .onChange((newFolder) => {
                        this.plugin.settings.scriptsFolder = newFolder;
                        this.plugin.saveSettings();
                    });
            });
    }
}
