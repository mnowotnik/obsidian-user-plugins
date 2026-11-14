import { App, Command, FuzzySuggestModal, Notice } from "obsidian";
import UserPlugins from "src/main";

export const PALETTE_COMMAND_ID = "open-command-palette";

interface PaletteItem {
    name: string;
    run: () => void;
}

/**
 * A command palette limited to commands registered by User Plugins itself
 * and by user scripts/snippets (they all register commands through this
 * plugin, so their ids share this plugin's id prefix).
 */
export class UserPluginsCommandPalette extends FuzzySuggestModal<PaletteItem> {
    constructor(app: App, private plugin: UserPlugins) {
        super(app);
        this.setPlaceholder("Type a User Plugins command...");
    }

    getItems(): PaletteItem[] {
        const { id, name } = this.plugin.manifest;
        const idPrefix = `${id}:`;
        const namePrefix = `${name}: `;
        const ownPaletteId = idPrefix + PALETTE_COMMAND_ID;

        const commands: PaletteItem[] = this.app.commands
            .listCommands()
            .filter(
                (cmd: Command) =>
                    cmd.id.startsWith(idPrefix) && cmd.id !== ownPaletteId
            )
            .map((cmd: Command) => ({
                name: cmd.name.startsWith(namePrefix)
                    ? cmd.name.slice(namePrefix.length)
                    : cmd.name,
                run: () => {
                    if (!this.app.commands.executeCommandById(cmd.id)) {
                        new Notice(
                            `User Plugins: "${cmd.name}" is not available here`
                        );
                    }
                },
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        commands.push({
            name: "Open User Plugins settings",
            run: () => {
                this.app.setting.open();
                this.app.setting.openTabById(id);
            },
        });
        return commands;
    }

    getItemText(item: PaletteItem): string {
        return item.name;
    }

    onChooseItem(item: PaletteItem): void {
        // let the modal close before running, so commands that open
        // their own modals aren't closed along with this one
        setTimeout(() => item.run(), 0);
    }
}
