import { App, FuzzyMatch, FuzzySuggestModal } from "obsidian";

class SuggesterModal<T> extends FuzzySuggestModal<T> {
    private resolved = false;
    constructor(
        app: App,
        private textItems: string[] | ((item: T) => string),
        private items: T[],
        private resolve: (value: unknown) => void,
        private reject: (reason?: any) => void,
        placeholder: string,
        limit?: number
    ) {
        super(app);
        this.setPlaceholder(placeholder);
        this.limit = limit || 20;
    }

    getItems(): T[] {
        return this.items;
    }

    getItemText(item: T): string {
        if (this.textItems instanceof Function) {
            return this.textItems(item);
        }
        return this.textItems[this.items.indexOf(item)] || "Undefined";
    }

    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        this.resolve(item);
    }

    selectSuggestion(
        value: FuzzyMatch<T>,
        evt: MouseEvent | KeyboardEvent
    ): void {
        this.onChooseSuggestion(value, evt);
        this.close();
    }

    onClose(): void {
        if (!this.resolved) {
            this.reject("Modal cancelled");
        }
    }

    onChooseSuggestion(
        item: FuzzyMatch<T>,
        evt: MouseEvent | KeyboardEvent
    ): void {
        this.onChooseItem(item.item, evt);
    }
}

export async function suggest<T>(
    app: App,
    itemLabels: string[] | ((item: T) => string),
    items: T[],
    placeholder: string,
    limit?: number
) {
    return new Promise((resolve, reject) => {
        new SuggesterModal(
            app,
            itemLabels,
            items,
            resolve,
            reject,
            placeholder,
            limit
        ).open();
    });
}
