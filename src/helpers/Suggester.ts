import { App, FuzzyMatch, FuzzySuggestModal } from "obsidian";

class SuggesterModal<T> extends FuzzySuggestModal<T> {
    private resolved = false;
    private labels: Map<T, string> | null = null;
    constructor(
        app: App,
        private textItems: string[] | ((item: T) => string),
        private items: T[],
        private resolve: (value: T) => void,
        private reject: (reason?: unknown) => void,
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
        // fuzzy search calls this for every item on every keystroke,
        // so build the item -> label lookup once instead of using indexOf
        if (!this.labels) {
            const textItems = this.textItems;
            const labels = new Map<T, string>();
            this.items.forEach((it, idx) => {
                if (!labels.has(it)) labels.set(it, textItems[idx]);
            });
            this.labels = labels;
        }
        return this.labels.get(item) || "Undefined";
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
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
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
