import { App, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";
import { UserPluginError } from "./Error";

function getByPath(app: App, path: string, kind: string): TAbstractFile {
    const entry = app.vault.getAbstractFileByPath(path);
    if (!entry) {
        throw new UserPluginError(`${kind} "${path}" doesn't exist`);
    }
    return entry;
}

/** Returns the folder at `path`, or throws a UserPluginError. */
export function getFolder(app: App, path: string): TFolder {
    path = normalizePath(path);
    const entry = getByPath(app, path, "Folder");
    if (!(entry instanceof TFolder)) {
        throw new UserPluginError(`${path} is a file, not a folder`);
    }
    return entry;
}

/** Returns the file at `path`, or throws a UserPluginError. */
export function getFile(app: App, path: string): TFile {
    path = normalizePath(path);
    const entry = getByPath(app, path, "File");
    if (!(entry instanceof TFile)) {
        throw new UserPluginError(`${path} is a folder, not a file`);
    }
    return entry;
}

/** All files under the folder at `path` (recursively), sorted by basename. */
export function getFilesInFolder(app: App, path: string): TFile[] {
    const files: TFile[] = [];
    const visit = (entry: TAbstractFile) => {
        if (entry instanceof TFile) {
            files.push(entry);
        } else if (entry instanceof TFolder) {
            entry.children.forEach(visit);
        }
    };
    visit(getFolder(app, path));
    return files.sort((a, b) => a.basename.localeCompare(b.basename));
}
