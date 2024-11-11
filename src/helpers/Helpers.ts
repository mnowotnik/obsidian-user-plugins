import { App, Notice } from "obsidian";
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

    notify(message: string, time: number = 5000) {
        new Notice(message, time);
    }
}
