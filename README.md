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
optionally an `async onunload(plugin): void` method. It has access to `module`, `exports` and the global function
`require` to get the `obsidian` module.
The `plugin` parameter is an instance of `obsidian-user-plugins` with the [Helper API](#helper-api). 

See [example](./examples/js-module/module.js).

### Snippet

A snippet is a JavaScript block of code that has access to the global `plugin`
variable. It also has access to the global function `require` to get the `obsidian`
module. Snippets are executed during the plugin initialization phase in `onload()`.
You can also access [Helper API](#helper-api) via the `plugin.api` object.

See [example](./examples/js-snippet/snippet.js).

# Importing libraries and styles

`await plugin.import(source, options?)` loads a JavaScript module or a CSS file,
either from your vault or from an `http(s)://` URL. It works on desktop and mobile.

```javascript
// a vendored ES module in the vault; resolves to the module's exports
const { default: CalHeatmap } = await plugin.import("Scripts/vendor/cal-heatmap.mjs");

// a stylesheet from a URL, pinned to a hash; resolves to { el, remove() }
await plugin.import("https://unpkg.com/cal-heatmap@4.2.4/dist/cal-heatmap.css", {
    sha256: "<the file's SHA-256, 64 hex characters>",
});

// a CommonJS/UMD file; resolves to module.exports
const lib = await plugin.import("Scripts/vendor/lib.js", { type: "cjs" });
```

- Options other than `sha256`, `type` and `fresh` are rejected, so a typo can't skip a hash check.
- The file type comes from the extension: `.js`/`.mjs` are ES modules, `.cjs` is CommonJS
  and `.css` is a stylesheet. Use `type: "esm" | "cjs" | "css"` to override it.
- `sha256` (optional): the file's SHA-256 as 64 hex characters. If you pass the key, it must hold
  a hash: `{ sha256: undefined }` is rejected, so a mistyped lookup can't skip the check. If the file doesn't match,
  the promise rejects. When this call is the one that loads the file, a mismatching file never
  runs; recommended for URLs. If another script already loaded the same file without a hash,
  it has already run; pass `fresh: true` as well to be sure the checked version is what runs.
  Calls that share one load also share its outcome, including a failed hash check.
- Loads of the same file run one at a time, in the order they were started. A load that never
  finishes (a request that hangs, or modules whose top-level code `await`s each other) blocks
  later imports of that file until User Plugins is reloaded.
- Each source is loaded once per type and shared between scripts, whether or not a call passes
  `sha256` (a hash is checked against the bytes that were loaded). Pass `fresh: true` to load it
  again; the newest load then replaces the old one once it succeeds (for CSS, the old style is removed).
- Failed imports are also logged to the console, so you see them even without `await`.
- Imported ES modules can't use relative `import` statements, because they're loaded from
  a blob URL. Use self-contained (bundled) files, or call `plugin.import` again for dependencies.
- Styles are added to every window, including popout windows opened later, and are removed
  when User Plugins unloads (after your scripts' `onunload`, which get up to 5 seconds in total).

From a plugin-type script, use `this.app.plugins.getPlugin("obsidian-user-plugins").import(...)`.

# Command palette

User Plugins has its own command palette, similar to the one in BRAT. It lists only
the commands that your scripts and snippets register with `plugin.addCommand`
(plus a shortcut to this plugin's settings), so you can find them without
looking through every command in the vault.

Open it with:

- the ribbon button (you can turn it off in settings under **General → Ribbon button**), or
- the `User Plugins: Open command palette` command, which you can bind to a hotkey.

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
