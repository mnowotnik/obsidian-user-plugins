import { Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "new-note-in-folder",
			name: "Create new note in a folder",
			callback: async () => {
				const api = (this.app as any).plugins.getPlugin(
					"obsidian-user-plugins"
				).api;
				const folders = api.getAllFolders();
				const folder = await api.suggest(folders, folders);
				const createdNote = await this.app.vault.create(
					folder + "/Hello World.md",
					"Hello World!"
				);
				api.openFile(createdNote);
			},
		});
	}
}
