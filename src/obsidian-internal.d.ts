import "obsidian";

declare module "obsidian" {
    interface App {
        commands: {
            listCommands(): Command[];
            executeCommandById(id: string): boolean;
        };
        setting: {
            open(): void;
            openTabById(id: string): void;
        };
    }
}
