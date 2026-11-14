import {
    App,
    Notice,
    PaneType,
    SplitDirection,
    TFile,
    TFolder,
    WorkspaceLeaf,
} from "obsidian";
import { suggest } from "./Suggester";

export class Helpers {
    constructor(private app: App) {}

    suggest<T>(
        itemLabels: string[] | ((item: T) => string),
        items: T[],
        placeholder?: string,
        limit?: number
    ) {
        return suggest(this.app, itemLabels, items, placeholder || "", limit);
    }

    notify(message: string, time = 5000) {
        new Notice(message, time);
    }

    getAllFolders() {
        return this.app.vault
            .getAllLoadedFiles()
            .filter((f) => f instanceof TFolder)
            .map((folder) => folder.path);
    }

    async openFile(
        file: TFile,
        params: {
            paneType?: PaneType;
            openInNewTab?: boolean;
            direction?: SplitDirection;
            mode?: "source" | "preview" | "default";
            focus?: boolean;
        } = {}
    ) {
        let leaf: WorkspaceLeaf;
        const paneType =
            params.paneType ?? (params.openInNewTab ? "tab" : undefined);

        if (paneType === "split") {
            leaf = this.app.workspace.getLeaf(paneType, params.direction);
        } else {
            leaf = this.app.workspace.getLeaf(paneType);
        }

        if (params.mode) {
            await leaf.openFile(file, { state: { mode: params.mode } });
        } else {
            await leaf.openFile(file);
        }

        if (params.focus) {
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
        }
    }
}
