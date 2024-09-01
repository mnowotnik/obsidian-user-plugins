# User Plugins for Obsidian

User Plugins is a simple plugin that lets you use Obsidian plugin API in your snippets or javascript files to modify
the behaviour of Obsidian just as if you created a plugin, but without the hassle.

# Stop and read

> :warning: **This plugin is for advanced users only**: DO NOT use code in scripts you do not fully
> understand. It can delete your notes or worse. See [legal notice](#Notice).

## Use cases

- [adding custom commands](https://docs.obsidian.md/Reference/TypeScript+API/Command)
- testing an idea for a plugin
- using plugin API to do anything you want

## Motivating example

Add command `Create new note in given folder` that allows you to choose
a folder before creating a note.

```javascript
module.exports = {}

module.exports.onload = async (plugin) => {
  const MarkdownView = plugin.passedModules.obsidian.MarkdownView
  plugin.addCommand({
    id: 'new-note-in-folder',
    name: 'Create new note in a folder',
    callback: async () => {
      const folders = plugin.app.vault.getAllLoadedFiles().filter(i => i.children).map(folder => folder.path);
      const folder = await plugin.helpers.suggest(folders, folders);
      const created_note = await plugin.app.vault.create(folder + "/Untitled.md", "")
      const active_leaf = plugin.app.workspace.activeLeaf;
      if (!active_leaf) {
        return;
      }
      await active_leaf.openFile(created_note, {
        state: { mode: "source" },
      });
      plugin.app.workspace.trigger("create",created_note)
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        const editor = view.editor;
        editor.focus()
      }
    }
  });
}
```

![Command in palette](https://user-images.githubusercontent.com/8244123/167032593-0dbe59b1-2c2a-4700-83f4-01609cf0d30a.png)

## Quick start

### Installation

~This plugin is not yet available in the Community Plugins panel.~

You can easily add this plugin from Community Plugins panel.
Alternatively, here's a manual way:

`git clone` this repo to `<YOUR VAULT>/.obsidian/plugins` folder and then execute:

```bash
npm install
npm run build
```

### Usage

Scripts can be added either by manually adding snippets or enabling each individual file in
a scripts directory in a vault. Scripts have access to a `Plugin` object. Its API is declared [here](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).
`plugin` has two additional members:

- `helpers`

    Currently it has a single method that opens a suggester modal:

    ```javascript
    suggest<T>(
        textItems: string[] | ((item: T) => string),
        items: T[],
        placeholder?: string,
        limit?: number
    )
    ```

- `passedModules`

    Currently only gives access to the `obsidian` module

#### Snippet

A snippet is just a javascript block of code that has access to a `plugin` variable.
It is executed in the `onload` method of the plugin.
Example:

```javascript
plugin.addCommand({
    id: 'foo-bar',
    name: 'FooBar',
    callback: () => {
        console.log('foobar');
    }
});
```

#### Script file

A script file follows CommonJS module specification and exports at least `onload` function that
takes a single argument `plugin` as an input. You must specify `onload` function in the exported
module and you can also specify `onunload` if needed.

To use scripts specify scripts folder in settings, hit the reload button to search for scripts in the specified path
and then enable each found script using a toggle button.

Example:
```javascript
module.exports = {}
module.exports.onload = function(plugin) {
    plugin.addCommand({
        id: 'foo-bar',
        name: 'FooBar',
        callback: () => {
            console.log('foobar');
        }
    });
}
module.exports.onunload = function(plugin) {
    console.log('unload')
}
```
## Obsidian developer documentation

The [[Obsidian Developer platform](https://docs.obsidian.md/Reference/TypeScript+API/) contains extensive documentation for the various plugin methods and interfaces, e.g. for the [Command](https://docs.obsidian.md/Reference/TypeScript+API/Command) interface or the [Plugin](https://docs.obsidian.md/Reference/TypeScript+API/Plugin) class. 

## Notice

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
