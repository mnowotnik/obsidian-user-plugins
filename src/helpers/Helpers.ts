import { App } from "obsidian";
import { suggest } from "./Suggester";

export class Helpers {
    constructor(private app: App) {}

    suggest<T>(
        textItems: string[] | ((item: T) => string),
        items: T[],
        placeholder?: string,
        limit?: number
    ) {
        return suggest(this.app, textItems, items, placeholder || "", limit);
    }
}
