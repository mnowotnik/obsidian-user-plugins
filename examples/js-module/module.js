module.exports = {
    async onload(plugin) {
        plugin.addCommand({
            id: "new-note-in-folder",
            name: "Create new note in a folder",
            callback: async () => {
                const api = plugin.api;
                const folders = api.getAllFolders();
                const folder = await api.suggest(folders, folders);
                const createdNote = await plugin.app.vault.create(folder + "/Hello World.md", "Hello World!");
                api.openFile(createdNote);
            },
        });
    },
    async onunload() {
        // optional
        console.log("unloading plugin");
    },
};
