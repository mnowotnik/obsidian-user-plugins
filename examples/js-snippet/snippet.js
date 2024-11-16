plugin.addCommand({
    id: "new-note-in-folder",
    name: "Create new note in a folder",
    callback: async () => {
        const folders = plugin.api.getAllFolders();
        const folder = await plugin.api.suggest(folders, folders);
        const createdNote = await plugin.app.vault.create(folder + "/Hello World.md", "Hello World!");
        plugin.api.openFile(createdNote);
    },
});
