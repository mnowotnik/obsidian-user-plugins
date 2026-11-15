# Design: script-scoped cleanup

Status: proposal; open questions resolved, mechanism pending Stage 0. No code changes accompany this document.
Line numbers in `obsidian.d.ts` refer to `obsidian@1.11.4`, the version in `package-lock.json`.

## Decisions

Resolved by the owner on 2026-11-15:

- **Duplicate command IDs across scripts**: warn (console + Notice) and let
  the later registration win, as today. (Q1)
- **Imported CSS** is removed when the last script that imported it is
  disabled (reference-counted). Needs a release note. (Q2)
- **Plugin-class `loadData`/`saveData`** sharing the host's `data.json`: out
  of scope for this work; known issue to be handled separately. (Q3)
- **No `plugin.host` escape hatch**: `app.plugins.getPlugin(...)` is the
  documented way to register for the host's lifetime. (Q4)
- **Add a unit-test runner** (vitest with a hand-written `obsidian` stub). (Q5)
- **Snippets stay identified by index**; no settings migration. (Q6)

Still to approve: the overall mechanism (per-script `ScriptScope` exposed
through a `Proxy` over the host; plugin-class scripts driven through
`load()`/`unload()`; command IDs unchanged). Stage 0 validates it.

## Recommended design (summary)

- The loader keeps one `LoadedScript` record per script key (file path, or
  `snippet:<index>`), replacing `modulesWithUnload`.
- **Module scripts and snippets** receive `scopedPlugin(host, scope)`, a
  `Proxy` whose `get` trap returns the scope's bound method for every
  Component/Plugin registration method (`addCommand`, `registerEvent`,
  `register`, `addChild`, ...), a scoped `import`, and the host's value for
  everything else (`api`, `app`, `manifest`, `helpers`, `passedModules`, ...).
  Writes go to the host, as today.
- **Plugin-class scripts** are already a `Plugin`; the loader calls `load()`
  (awaiting the async `onload`) and later `unload()`, so Obsidian's own
  `Component` bookkeeping removes their commands, events, ribbon icons, etc.
- **Teardown order** for every script: author `onunload` (awaited, 5 s
  timeout), then `scope.unload()` (synchronous, always runs, errors logged).
  Teardown also runs when `onload` throws, when an enabled file disappears,
  and for every remaining script on host unload.
- **Commands** are removed by Obsidian's own `Plugin.addCommand` cleanup when
  the scope unloads; no internal API is needed for removal.
- **Reload** = serialized `unloadScript(key)` then `loadScript(key)` (file
  re-read from the vault), which is the basis for a "Reload scripts" command.

## Current behaviour

### How scripts get the host today

- Module scripts: `exports.onload(this.plugin)` where `this.plugin` is the
  shared `UserPlugins` instance (`src/loaders/cjsModuleLoader.ts:101`), and
  `onunload(this.plugin)` (`src/loaders/cjsModuleLoader.ts:162`).
- Plugin-class scripts: `new exports.default(this.app, this.plugin.manifest)`
  (`src/loaders/cjsModuleLoader.ts:109-112`), then `await userPlugin.onload()`
  directly (`:113`) and later `await userModule.object.onunload()` directly
  (`:160`). `Component.load()`/`unload()` (`obsidian.d.ts:1513,1526`) are never
  called, and the instance is never `addChild`-ed to anything.
- Snippets: `Function("plugin", "require", snippet)(this.plugin, require)`
  (`src/loaders/cjsModuleLoader.ts:45`). No record is kept.

### What triggers unload today

- Toggle off in settings calls `runOnunload(path)` (`src/settings/Settings.ts:143`),
  which only finds scripts pushed into `modulesWithUnload`. Module scripts are
  pushed **only if they export `onunload`** (`src/loaders/cjsModuleLoader.ts:102-107`);
  a module without `onunload` is not tracked, so disabling it does nothing.
- Toggle on calls `runJsModule(path)` (`src/settings/Settings.ts:141`) with no
  check that the script is already loaded. Neither call is awaited, so a fast
  off/on can interleave unload and load.
- If `onload` throws, nothing is recorded (`src/loaders/cjsModuleLoader.ts:124-133`):
  whatever it registered before the throw stays, and its `onunload` is never
  called.
- Enabled files that no longer exist are dropped from `enabledScripts`
  (`src/settings/Settings.ts:154-159`) without unloading them.
- Snippets: "Run snippet" re-executes the snippet (`src/settings/Settings.ts:174`)
  on top of the previous run; deleting a snippet (`src/settings/Settings.ts:195`)
  unloads nothing.
- Host unload: `loader.onunload()` runs each tracked `onunload` in order,
  raced against `SCRIPT_UNLOAD_TIMEOUT_MS = 5000` (`src/main.ts:13,97-113`);
  then `importer.unload()` runs in `finally` (`src/main.ts:111`). Single-script
  disable has no timeout (`src/loaders/cjsModuleLoader.ts:136-146`).

### Inventory

"Host lifetime" = released only when the User Plugins plugin itself unloads,
because the registration was made on the host `Component`. "Leaks" = never
released until Obsidian restarts, because the owning `Component` (the
plugin-class instance) is never `unload()`-ed. All Component/Plugin
registration methods behave the same way here, because they all record their
cleanup on the receiving component (`register`, `registerEvent`,
`registerDomEvent`, `registerInterval` on `Component`, `obsidian.d.ts:1551-1583`;
`addCommand` etc. on `Plugin`, `obsidian.d.ts:4593-4689`).

| Registration | Module script, disable | Plugin-class script, disable | Snippet | Host unload |
|---|---|---|---|---|
| `addCommand` | Host lifetime | Leaks | Host lifetime; no disable exists | Module/snippet: removed. Plugin-class: leaks |
| `registerEvent` | Host lifetime; duplicated on re-enable | Leaks; duplicated on re-enable | Duplicated on every "Run snippet" | same |
| `registerDomEvent` | Host lifetime; duplicated | Leaks; duplicated | Duplicated | same |
| `registerInterval` | Host lifetime; duplicated | Leaks; duplicated | Duplicated | same |
| `register(cb)` | Runs at host unload only | Never runs | Runs at host unload | same |
| `addRibbonIcon` | Host lifetime; second icon on re-enable | Leaks; second icon | Second icon per run | same |
| `addStatusBarItem` | Host lifetime; duplicated | Leaks; duplicated | Duplicated | same |
| `registerMarkdownPostProcessor` / `...CodeBlockProcessor` | Host lifetime; duplicated | Leaks; duplicated | Duplicated | same |
| `registerEditorExtension` | Host lifetime; duplicated | Leaks; duplicated | Duplicated | same |
| `registerView`, `registerExtensions`, `registerObsidianProtocolHandler`, `registerEditorSuggest`, `registerHoverLinkSource`, `registerBasesView`, `addSettingTab` | Host lifetime | Leaks | Host lifetime | same |
| `addChild(component)` | Child of host; unloaded at host unload | Child of an unloaded instance: added but never loaded or unloaded | Child of host | same |
| `plugin.import` CSS | Stays until `importer.unload()` (`src/main.ts:111`) or the author calls `handle.remove()` (`src/import/Importer.ts:414`) | same (via `getPlugin(...)`) | same | removed |
| `plugin.import` JS/CJS | Cached for the host's lifetime (`src/import/Importer.ts:167`); side effects never undone | same | same | cache cleared |

Commands re-added with the same ID replace the earlier one (commands are
keyed by full ID), which is why duplicated commands are not visible today
while duplicated listeners are.

Corrections to the problem statement:

- Plugin-class scripts are worse than "host lifetime": nothing they register
  through `this.*` is released even when the host unloads, because cleanup
  callbacks live on the instance and only `unload()` runs them. An author's
  `onunload` is still called, but Obsidian's automatic cleanup is not.
- Module scripts without `onunload` are not even tracked, so disabling them
  calls nothing.
- Plugin-class command IDs are already prefixed with the **host's** ID
  (`Plugin.addCommand` prefixes with the instance's manifest,
  `obsidian.d.ts:4606`, and the manifest is the host's,
  `cjsModuleLoader.ts:111`). All three script types share one command
  namespace, `obsidian-user-plugins:`, which `CommandPalette.ts:23-32` relies on.
- Because the manifest is the host's, a plugin-class script's
  `loadData`/`saveData` (`obsidian.d.ts:4697,4705`) target the host's
  `data.json` and can overwrite User Plugins' settings. Out of scope for
  this work (Q3).

## Proposed mechanism

### Scope object: `ScriptScope extends Plugin`

```ts
// src/loaders/ScriptScope.ts
export class ScriptScope extends Plugin {
    constructor(app: App, manifest: PluginManifest, readonly key: string) {
        super(app, manifest);
    }
    // onload/onunload stay empty: the scope only collects registrations
}
```

Constructing a second `Plugin` with the host manifest is exactly what the
plugin-class path already does (`cjsModuleLoader.ts:109-112`), so this relies
on no new assumption. Because the manifest is the host's, `scope.addCommand`
produces the same `obsidian-user-plugins:<id>` / `User Plugins: <name>` that
scripts get today. The scope is `load()`-ed before the script runs so that
`addChild` loads children immediately.

The scope is **not** `addChild`-ed to the host. `Component.unload()` is
synchronous (`obsidian.d.ts:1526`), so a child of the host would be torn
down when Obsidian unloads the host, before the async `loader.onunload()`
(`src/main.ts:104`) gets to run authors' `onunload`. The loader owns the
scopes and unloads them itself, in a fixed order (below).

### What the script sees: a `Proxy` over the host

```ts
// src/loaders/scopedPlugin.ts
const SCOPED = new Set<PropertyKey>([
    // Component
    "register", "registerEvent", "registerDomEvent", "registerInterval",
    "addChild", "removeChild",
    // Plugin
    "addCommand", "removeCommand", "addRibbonIcon", "addStatusBarItem",
    "addSettingTab", "registerView", "registerHoverLinkSource",
    "registerExtensions", "registerMarkdownPostProcessor",
    "registerMarkdownCodeBlockProcessor", "registerBasesView",
    "registerEditorExtension", "registerObsidianProtocolHandler",
    "registerEditorSuggest",
]);

export function scopedPlugin(
    host: UserPlugins,
    scope: ScriptScope,
    scopedImport: UserPlugins["import"]
): UserPlugins {
    const bound = new WeakMap<Function, Function>();
    const bind = (fn: Function, self: object) => {
        let b = bound.get(fn);
        if (!b) bound.set(fn, (b = fn.bind(self)));
        return b;
    };
    return new Proxy(host, {
        get(target, prop) {
            if (prop === "import") return scopedImport;
            if (prop === "register") return safeRegister(scope);
            if (SCOPED.has(prop)) {
                return bind((scope as any)[prop], scope);
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" && prop !== "constructor"
                ? bind(value, target)
                : value;
        },
        // set/has/defineProperty: default traps, i.e. they act on the host
    });
}
```

- Non-scoped methods are bound to the host so that a host method that itself
  registers (e.g. `setRibbonIcon`, `src/main.ts:84-95`) keeps registering on
  the host, as it does today.
- `safeRegister` wraps author callbacks in `try/catch` so one throwing
  cleanup does not abort the rest of `scope.unload()`.
- `plugin instanceof Plugin` and `instanceof UserPlugins` still hold (the
  Proxy forwards `getPrototypeOf`). `plugin === app.plugins.getPlugin(id)` no
  longer holds; nothing in `examples/` depends on it.
- New registration methods Obsidian adds later fall through to the host until
  added to `SCOPED`. That is the main maintenance cost; a dev-time check can
  compare `SCOPED` with `Object.getOwnPropertyNames(Plugin.prototype)` and
  log unknown `register*`/`add*` names.

### Plugin-class scripts: drive `load()`/`unload()`

The instance is its own scope; no Proxy. Two adjustments keep today's
semantics (awaited async `onload`/`onunload`, errors reported, timeout):

```ts
async function loadPluginInstance(p: Plugin): Promise<void> {
    let result: unknown;
    const original = p.onload;
    p.onload = function () { result = original.call(this); };
    try {
        p.load();          // sets the loaded flag, calls our shim, loads children
    } finally {
        delete (p as any).onload; // restore the prototype method
    }
    await result;          // surfaces async onload errors as today
}

async function unloadPluginInstance(p: Plugin, timeoutMs: number) {
    await withTimeout(p.onunload(), timeoutMs);   // author first, awaited
    p.onunload = () => {};                         // do not run it twice
    try { p.unload(); } finally { delete (p as any).onunload; }
}
```

(If a class defines `onload`/`onunload` as own instance properties, save and
restore the own property instead of `delete`; Stage 0 checks this.)

Shadowing the instance's own `onload`/`onunload` uses public API only and
avoids depending on whether `Component.load()` awaits `onload` (its typing
returns `void`).

### Teardown order and error handling (all script types)

```
unloadScript(key):
  1. author onunload            awaited, 5 s timeout, errors -> log + Notice (as today)
  2. scope.unload()             always, in finally; errors -> log
  3. release CSS handles owned by the scope (refcounted)
  4. delete the LoadedScript record
```

- The author's `onunload` runs first, so it can still use its own commands,
  views and `plugin.import`, which matches today's order relative to
  `importer.unload()` (`src/main.ts:98-100`).
- `onunload` now runs whether or not it was exported: modules without one are
  tracked too, because they own a scope.
- If `onload` throws, the loader calls `scope.unload()` (not the author's
  `onunload`, matching today, where a failed `onload` is never unloaded).
- Host unload keeps the single 5 s race in `src/main.ts:101-108`; its
  `finally` gains `loader.forceUnloadAll()` (synchronous `scope.unload()` for
  every remaining script, in reverse load order) before `importer.unload()`.
  A hung `onunload` therefore cannot keep registrations alive. Single-script
  disable gets the same 5 s timeout per script.
- Operations on one key are serialized through a per-key promise chain, so a
  fast toggle off/on, or a reload during load, cannot interleave.

### Commands

- Registration: `scope.addCommand(cmd)` is Obsidian's `Plugin.addCommand`, so
  the full ID and name are what they are today. Hotkeys (stored by full
  command ID) and the User Plugins palette (`CommandPalette.ts:23-32`) keep
  working; reloading re-adds the same ID, so a hotkey survives a reload.
- Removal: the scope's `unload()` runs the cleanup `Plugin.addCommand`
  records, the same path every Obsidian plugin uses on disable (the typings
  say manual `removeCommand` "should not be needed unless your plugin
  registers commands dynamically", `obsidian.d.ts:4612-4617`). A script's own
  `plugin.removeCommand(id)` (public since 1.7.2, the repo's `minAppVersion`,
  `manifest.json:4`) is routed to its scope.
- **No per-script prefix.** Prefixing with the script name would change every
  ID and break existing hotkeys and any `executeCommandById` callers.
- Collisions: because all scripts share one namespace, script B may register
  an ID script A already holds; unloading A would then remove B's command.
  The loader keeps `Map<fullId, key>` (filled by a thin wrapper around the
  scope's `addCommand`) and, on a duplicate held by another live script,
  logs a warning and shows a Notice (Q1). Checking that the command currently
  registered under an ID is the one this scope added would need the internal
  `app.commands` registry; the repo already depends on `app.commands`
  (`src/obsidian-internal.d.ts:5-8`), but this design avoids adding more.

### Snippets

- Each snippet run gets a `ScriptScope` keyed `snippet:<index>` and the same
  Proxy as module scripts. Snippets still run synchronously via `Function`
  (`cjsModuleLoader.ts:45`); registrations made later from callbacks still
  land in the scope because the Proxy is captured.
- Torn down when: the same snippet is run again ("Run snippet" becomes
  "reload snippet"), the snippet is deleted (`Settings.ts:195`; scope records
  are spliced alongside `settings.snippets` so indices stay aligned), and on
  host unload. Editing the text does not re-run it, as today.
- Snippets have no unload hook; the scope gives them one:
  `plugin.register(() => ...)`.

### `plugin.import`, `plugin.api` and friends

- `import` on the Proxy calls the host importer and, for CSS results,
  registers the `StyleHandle` with the scope. The Importer shares one load
  per source across callers (`src/import/Importer.ts:162-167`), and
  `handle.remove()` drops the sheet and its cache entry for everyone
  (`src/import/Importer.ts:414-421`). So the loader keeps
  `Map<StyleHandle, Set<key>>` and calls `remove()` only when the last owning
  script unloads. An author calling `remove()` themselves is harmless
  (`removeSheet` is idempotent, `src/import/Importer.ts:391-394`).
- JS/CJS imports are only cached values; nothing to tear down. On reload the
  script file is re-read (`cjsModuleLoader.ts:84-85`) but its imports come
  from the cache unless `fresh: true`; this is documented, not changed.
- `api`, `helpers`, `passedModules`, `app`, `manifest` are read through the
  Proxy from the host unchanged (`src/main.ts:42-44`). `Helpers` registers
  nothing (`src/helpers/Helpers.ts`).
- Scripts that call `app.plugins.getPlugin("obsidian-user-plugins")` (both
  plugin examples, `examples/js-plugin/plugin.js:9`,
  `examples/ts-plugin/main.ts:9-11`) get the real host. Reading `api` that way
  is fine; registering on it keeps host lifetime. `app.plugins` is internal
  and untyped (not in `src/obsidian-internal.d.ts`), so we do not intercept
  it. Guidance: register through `this` (plugin-class) or the `plugin`
  argument (module/snippet).

### What is still not cleaned up automatically

Anything not routed through the scope: monkey-patches of app internals or
prototypes, `window`/global assignments (including `plugin.foo = ...`, which
writes to the shared host by design), direct DOM changes
(`document.body.appendChild`, `el.addClass`), raw
`setTimeout`/`setInterval`/`addEventListener`/`MutationObserver`,
`app.workspace.on(...)` without `registerEvent`, file writes, and anything
registered on the host reached via `getPlugin`.

Guidance in the README, all standard Obsidian API on the scoped `plugin`:

```js
plugin.registerInterval(window.setInterval(tick, 1000));
plugin.registerEvent(plugin.app.workspace.on("file-open", onOpen));
plugin.registerDomEvent(document, "keydown", onKey);
plugin.register(around(SomeClass.prototype, { method: wrap })); // monkey-around returns an uninstaller
plugin.register(() => myEl.remove());
```

No new helper is needed: `register(cb)` covers every case, and it is the
idiom Obsidian plugin authors already know.

### Single-script reload

```
reloadScript(key):              serialized on key
  if loaded: unloadScript(key)  steps 1-4 above
  loadScript(key)               re-read file, evaluate, new scope, onload
  on load failure: scope torn down, Notice shown, script stays enabled
reloadAll():
  unload all in reverse load order, then load enabled scripts in
  settings order, then snippets (matches cjsModuleLoader.ts:34-41)
```

The host registers `Reload all scripts` and `Reload script...` (suggester over
loaded keys) commands; they show up in the User Plugins palette
automatically (`CommandPalette.ts:28-32`). Toggle on/off in settings becomes
`loadScript`/`unloadScript`, and enabled files missing from the folder are
unloaded (`Settings.ts:154-159`).

## API surface

Nothing changes for script authors' types: module scripts still receive
something typed `UserPlugins`; plugin-class scripts still extend `Plugin`.
Internal loader surface:

```ts
type ScriptKind = "module" | "plugin" | "snippet";

interface LoadedScript {
    readonly key: string;                 // vault path or `snippet:${index}`
    readonly kind: ScriptKind;
    readonly scope: Plugin;               // ScriptScope, or the user's instance
    readonly exports?: UserModule;        // module scripts
    readonly plugin?: UserPlugins;        // the Proxy given to module/snippet
}

export default class CjsModuleLoader implements Loader {
    loadScript(path: string): Promise<void>;     // replaces runJsModule
    unloadScript(path: string): Promise<void>;   // replaces runOnunload
    reloadScript(path: string): Promise<void>;
    reloadAll(): Promise<void>;
    runSnippet(snippet: string, idx: number): Promise<void>; // reloads idx
    removeSnippet(idx: number): void;
    loadedKeys(): string[];
    onunload(): Promise<void>;
    forceUnloadAll(): void;                      // sync, for main.ts finally
}
```

`runJsModule`/`runOnunload` stay as deprecated aliases for one release in
case anything outside the repo calls them.

### Before / after

```js
// module script, unchanged source
module.exports = {
    async onload(plugin) {
        plugin.addCommand({ id: "hello", name: "Hello", callback: () => {} });
        plugin.registerEvent(plugin.app.workspace.on("file-open", log));
    },
};
```

Before: disabling does nothing (no `onunload`, so not tracked); re-enabling
adds a second `file-open` listener; both stay until User Plugins unloads.
After: disabling removes the `obsidian-user-plugins:hello` command and the
listener; re-enabling or reloading adds exactly one of each; a hotkey bound
to `obsidian-user-plugins:hello` keeps working.

## Backward compatibility

- Scripts need no changes. Calls that registered on the host now register on
  a scope with the same manifest, so IDs, names and behaviour while loaded are
  identical. The only differences are earlier teardown (intended) and
  `plugin !== getPlugin(...)` identity.
- Scripts with their own `onunload` that remove what they registered: the
  automatic teardown runs after it; removing an already-removed command,
  event or element is a no-op in Obsidian (to confirm in Stage 0).
- A module that registers something in `onload` meant to outlive the script
  (rare) loses it on disable; escape hatch is `getPlugin(...)` (Q4).
- Plugin-class scripts now get Obsidian's real lifecycle: children added with
  `addChild` load, and registrations are released on disable and on host
  unload. Their `onload`/`onunload` are still each called once, awaited, with
  errors reported as today.

## Alternatives considered

- **Per-script `Component` (not `Plugin`) child + Proxy.** `Component` only has
  `register*`/`addChild`; `addCommand`, `addRibbonIcon` etc. would have to be
  reimplemented on top of internal APIs. Rejected: `Plugin` gives all of them
  with Obsidian's own cleanup.
- **`Object.create(host)` with overridden methods instead of a Proxy.**
  Simpler, but `plugin.foo = x` would land on the per-script object, breaking
  scripts that share state through the host. Rejected.
- **Wrapping the host's methods to record registrations (option c).** A
  registration cannot be attributed to a script once it happens outside the
  synchronous `onload` (after an `await`, in a command callback, in a
  snippet's timer), and wrapping the host would also capture the host's own
  registrations. Per-script wrappers on a per-script object would work, but
  would reimplement what `Component` already does. Rejected; the Proxy only
  uses the "route these method names" part of the idea.
- **Per-script command ID prefix** (`obsidian-user-plugins:<script>:<id>`).
  Avoids collisions but breaks every existing hotkey and
  `executeCommandById` caller. Rejected; at most an opt-in later.
- **`addChild` the scopes to the host.** Gives host-unload cleanup for free,
  but tears scopes down before authors' async `onunload` runs (see above).
  Rejected in favour of `forceUnloadAll()` in `main.ts`.

## Resolved questions

1. Duplicate command ID across scripts: **warn and let the later one win.**
2. Imported CSS: **removed when the last owning script is disabled.**
3. Plugin-class scripts sharing the host's `data.json`: **out of scope**;
   tracked separately (changing their manifest is not an option, it would
   change command IDs).
4. Escape hatch for host-lifetime registrations: **none**; `getPlugin(...)`
   is enough.
5. Unit-test runner: **add vitest** with a hand-written `obsidian` stub.
6. Snippet identity: **keep array index**; no migration.

## Implementation plan

| Stage | Content | Size |
|---|---|---|
| 0 | Spike in a test vault, no merge: run the [Stage 0 checklist](#stage-0-checklist) | half a day |
| 1 | vitest setup with an `obsidian` stub; `ScriptScope`, `scopedPlugin` Proxy, `LoadedScript` map, per-key serialization, module scripts load/unload with timeout, teardown on `onload` failure and on missing files, `forceUnloadAll` in `main.ts` | ~250 LOC |
| 2 | Plugin-class scripts via `load()`/`unload()` | ~60 LOC |
| 3 | Snippet scopes; "Run snippet" reloads; delete tears down | ~60 LOC |
| 4 | Scoped `import` with CSS refcount | ~50 LOC |
| 5 | `reloadScript`/`reloadAll` and the two commands | ~80 LOC |
| 6 | README section on cleanup and `register(cb)`; update examples | docs |

Each stage is shippable on its own; 1 is the prerequisite for the rest.

### Stage 0 checklist

Things the design relies on that the typings cannot confirm. Each is checked
in a test vault on Obsidian 1.7.2 (the `minAppVersion`) and the current
release, using a throwaway build that constructs a second `Plugin` with the
host manifest (a "scope"), registers through it, and calls `unload()`.

**1. `unload()` of a second `Plugin` removes its registrations.** For each,
register, call `scope.unload()`, confirm it is gone:

- [ ] `addCommand`: gone from the command palette and the User Plugins palette
- [ ] `addRibbonIcon`, `addStatusBarItem`: elements removed from the DOM
- [ ] `registerEvent`, `registerDomEvent`, `registerInterval`: stop firing
- [ ] `registerMarkdownPostProcessor`, `registerMarkdownCodeBlockProcessor`:
  not applied on the next render
- [ ] `registerEditorExtension`: already-open editors drop it, not only new ones
- [ ] `registerView`, `registerExtensions`: view type and file extension unregistered
- [ ] `addSettingTab`: tab removed from the settings modal; also whether a
  scope's tab shows up as a second "User Plugins" entry (shared manifest)
- [ ] `registerObsidianProtocolHandler`, `registerEditorSuggest`,
  `registerHoverLinkSource`, `registerBasesView`: unregistered

**2. Double removal is a no-op.**

- [ ] Author removes a command, event or element in `onunload`, then
  `scope.unload()` runs: no throw, no console errors
- [ ] `removeCommand` on a scope works on 1.7.2

**3. Command IDs and hotkeys.**

- [ ] A scope's command ID is `obsidian-user-plugins:<id>`, same as today
- [ ] A hotkey bound to it still works after unload + load
- [ ] Two scopes registering the same ID: the later replaces the earlier;
  record what unloading the first scope does to the second's command
  (expected: removes it, which is why Q1 warns)

**4. Plugin-class scripts through `load()`/`unload()`.**

- [ ] `Component.load()` calls an instance-own `onload` (the shim), not only
  the prototype method
- [ ] Whether `load()` awaits an async `onload` (the design assumes not and
  awaits the shim's result itself)
- [ ] Classes defining `onload`/`onunload` as class fields (instance-own):
  save/restore of the own property keeps them working
- [ ] `addChild` on an already-loaded scope loads the child immediately
- [ ] After `unload()`, the author's `onunload` is not called a second time

**5. Open views of an unregistered type.**

- [ ] What happens to open leaves when their view type is unregistered
  (closed, emptied, or error)
- [ ] Whether they recover when the script loads again and re-registers

**6. The `Proxy` given to scripts.**

- [ ] `plugin instanceof Plugin` and `instanceof UserPlugins` hold
- [ ] Nothing Obsidian calls on the plugin object breaks when it is a Proxy
- [ ] Host methods that register (e.g. `setRibbonIcon`, `src/main.ts:84-95`)
  still register on the host, not on the scope

**7. Host shutdown.**

- [ ] Disabling User Plugins with a plugin-class script loaded removes that
  script's commands (they leak today)

**If something fails.** For a failing registration type in 1, 2 or 5, fall
back to removal through an internal API or leave it host-lifetime, and
record which in this document. If 1 fails broadly, the `ScriptScope`
mechanism needs rethinking before Stage 1. A failure in 4 only affects
Stage 2 (keep calling `onload`/`onunload` directly and unload the instance
afterwards).

### Testing

The repo has no test runner: `package.json` scripts are `dev`, `build`
(`tsc -noEmit` + esbuild) and `lint`, and the only CI workflow builds on tag
push (`.github/workflows/release.yml`). So:

- Every stage must pass `npm run build` and `npm run lint`.
- Manual checklist in a test vault, per script type: enable, check
  command/ribbon/status bar/event/interval/post-processor/editor
  extension/CSS present; disable, check all gone; re-enable and reload, check
  exactly one of each; hotkey on a script command survives reload; script with
  its own `onunload` (runs first, no errors); `onunload` that never resolves
  (teardown still happens after 5 s); `onload` that throws halfway (partial
  registrations removed); two scripts importing the same CSS; disable User
  Plugins itself with a plugin-class script loaded (its command is gone).
- Unit tests (vitest, approved) for the Proxy routing, CSS refcount and
  per-key serialization against a small `obsidian` stub, which need no
  running Obsidian.
