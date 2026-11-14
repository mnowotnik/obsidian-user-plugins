// Originally based on Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes
// MIT License
// Copyright (c) 2021 Liam Cain

import { AbstractInputSuggest, App, TAbstractFile, TFolder } from "obsidian";

// AbstractInputSuggest renders the popover in the window that owns the input,
// so it also works when Settings is open in a popout window.
export default class FolderSuggester extends AbstractInputSuggest<TFolder> {
    constructor(app: App, private textInputEl: HTMLInputElement) {
        super(app, textInputEl);
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().includes(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}
