import { App, normalizePath, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { UserPluginInternalError } from "./Error";


// attribution: SilentVoid13, https://github.com/SilentVoid13/Templater
// License: AGPL-3.0 https://www.gnu.org/licenses/agpl-3.0.en.html
export function resolve_tfolder(app: App, folder_str: string): TFolder {
    folder_str = normalizePath(folder_str);

    const folder = app.vault.getAbstractFileByPath(folder_str);
    if (!folder) {
        throw new UserPluginInternalError(`Folder "${folder_str}" doesn't exist`);
    }
    if (!(folder instanceof TFolder)) {
        throw new UserPluginInternalError(`${folder_str} is a file, not a folder`);
    }

    return folder;
}

// attribution: SilentVoid13, https://github.com/SilentVoid13/Templater
// License: AGPL-3.0 https://www.gnu.org/licenses/agpl-3.0.en.html
export function resolve_tfile(app: App, file_str: string): TFile {
    file_str = normalizePath(file_str);

    const file = app.vault.getAbstractFileByPath(file_str);
    if (!file) {
        throw new UserPluginInternalError(`File "${file_str}" doesn't exist`);
    }
    if (!(file instanceof TFile)) {
        throw new UserPluginInternalError(`${file_str} is a folder, not a file`);
    }

    return file;
}

// attribution: SilentVoid13, https://github.com/SilentVoid13/Templater
// License: AGPL-3.0 https://www.gnu.org/licenses/agpl-3.0.en.html
export function get_tfiles_from_folder(
    app: App,
    folder_str: string
): Array<TFile> {
    
    const folder = resolve_tfolder(app, folder_str);

    const files: Array<TFile> = [];
    
    Vault.recurseChildren(folder, (file: TAbstractFile) => {
        if (file instanceof TFile) {
            files.push(file);
        }
    });

    files.sort((a, b) => {
        return a.basename.localeCompare(b.basename);
    });

    return files;
}
