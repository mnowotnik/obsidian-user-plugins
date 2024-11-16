# Obsidian User Plugins

Lets you use the Obsidian plugin API in your snippets or JavaScript files to modify the behavior of Obsidian, just as if you created a plugin, but without the hassle.

# Stop and read

> :warning: **This plugin is for advanced users only**: DO NOT use code in scripts you do not fully understand. 
> It can delete your notes or worse. See [legal notice](#Notice).

# Caveats

## Obsidian API compatibility

> :warning: Do not assume user scripts can run any Obsidian API functions other
> than what is shown in the examples. Creating settings is especially not supported, but it is on the [roadmap](#roadmap).

## Versioning

Newer versions of this plugin will usually require the newest Obsidian version due to its API changes. Consider this plugin "bleeding edge" for now.

# Use cases

- [Adding custom commands](https://docs.obsidian.md/Reference/TypeScript+API/Command)
- Testing an idea for a plugin
- Using Obsidian plugin API to do anything you want

# Motivating example

Add command `Create new note in folder` that allows you to choose a folder
before creating a note:

```javascript
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

```

![Command in palette](https://user-images.githubusercontent.com/8244123/167032593-0dbe59b1-2c2a-4700-83f4-01609cf0d30a.png)

# Quick start

## Installation

You can easily add this plugin from Community Plugins panel.
Alternatively, here's a manual way:

Clone this repository into the `<YOUR VAULT>/.obsidian/plugins` folder and then execute:

```bash
npm install
npm run build
```

## Usage

You can add scripts either by manually adding snippets or enabling each individual file in the defined scripts directory in your vault.

To use scripts, specify a scripts folder in settings, hit the reload button to search for scripts in the specified path,
then enable each script found using a toggle button.

There are a few types of scripts that you can use.

### Obsidian plugin type

Has the basic structure of an Obsidian plugin:

```typescript
import { Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
	async onload() {
        // code here
	}
}
```
Written in either [Typescript](./examples/ts-plugin/main.ts) or [Javascript](./examples/js-plugin/plugin.js) flavour.

You have access to [Helper API](#helper-api) by getting `obsidian-user-plugins` via `this.app.plugins.getPlugin`.

### Module type

A JavaScript module that exports at least an `async onload(plugin): void` method and
optionally an `async onnunload(): void` method. It has access to the global function
`require` to get the `obsidian` module.
The `plugin` parameter is an instance of `obsidian-user-plugins` with the [Helper API](#helper-api). 

See [example](./examples/js-module/module.js).

### Snippet

A snippet is a JavaScript block of code that has access to the global `plugin`
variable. It also has access to the global function `require` to get the `obsidian`
module. Snippets are executed during the plugin initialization phase in `onload()`.
You can also access [Helper API](#helper-api) via the `plugin.api` object.

See [example](./examples/js-snippet/snippet.js).

# Helper API

This plugin exposes an `api` object with handy methods. Check them out [here](./src/helpers/Helpers.ts).

# Roadmap

- [ ] Custom configuration per script file
- [ ] Additional functions in the [Helper API](#helper-api)

# Obsidian Plugin API

The Obsidian plugin API is declared [here](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

The [Obsidian Developer platform](https://docs.obsidian.md/Reference/TypeScript+API/) contains extensive documentation for the various plugin methods and interfaces, e.g. for the [Command](https://docs.obsidian.md/Reference/TypeScript+API/Command) interface or the [Plugin](https://docs.obsidian.md/Reference/TypeScript+API/Plugin) class. 

# Notice

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
