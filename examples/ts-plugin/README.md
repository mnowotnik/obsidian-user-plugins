# Sample Plugin

This is just cloned [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) with [main.ts](./main.ts) modified.

Compile it with

```bash
npm install
npm run build
```

and set the directory in Obsidian User Plugins.
The file `main.js` should appear on the list of available scripts.
Change `esbuild.config.mjs` to modify the name of the output file `main.js`.
