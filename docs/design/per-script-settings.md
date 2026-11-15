# Design: per-script settings

Status: decisions approved (see [Decisions](#decisions)). No code has been written yet.
Roadmap item: "Custom configuration per script file" (`README.md:121`). The README
currently warns that "Creating settings is especially not supported" (`README.md:15`).

## Decisions

All approved.

1. **How scripts declare settings: a declarative `settings` export only (v1).** The host
   renders, validates and stores the values. An imperative `renderSettings(containerEl, ctx)`
   hook is deferred to a later stage and added only if users ask for it (see [Alternatives](#alternatives-considered)).
2. **Where values are stored: in the host's `data.json`, under a new optional key
   `scriptSettings`, keyed by the script's vault path.** No sidecar files. Values move
   with the script on rename. They are kept, not deleted, when the script is deleted.
3. **Secrets: a `secret` field type backed by Obsidian's `SecretStorage`**
   (`app.secretStorage`, since 1.11.4). `data.json` stores only the secret's *name*.
   **`minAppVersion` is raised from 1.7.2 to 1.11.4**, so no runtime feature detection
   and no plain-text fallback are needed.
4. **Plugin-class scripts: `this.loadData()` / `this.saveData()` redirected to the
   script's own storage.** Today they read and write the *host's* `data.json` (see
   [current behaviour](#current-behaviour-that-matters)). This is a behaviour change, and
   it fixes a real hazard.
5. **Snippets are out of scope.** They have no stable identity and no export surface.
6. **Scripts are never evaluated just to read their schema.** The settings UI appears only
   for a script that is enabled and has been evaluated. Values are kept while the script is disabled.
7. **Export name: `settings`.** An existing script might already export something called
   `settings`; strict validation logs and ignores an invalid schema and never breaks loading.
8. **Tests: add a zero-dependency harness** (`node:test` plus the existing `esbuild`).
   The repo has no tests today.
9. **Key renames are not supported.** Keeping keys compatible across versions is the
   script author's responsibility; a renamed key gets its default. No `aliases` or `migrate`.
10. **The host implements `onExternalSettingsChange` in v1.** When sync changes
    `data.json`, the host reloads its settings, fires script `onChange` listeners, and
    applies changes to `enabledScripts` (loading or unloading scripts).
11. **Author types ship as a copy-paste `.d.ts` in `examples/`**, not an npm package.
12. **Missing-scripts section offers "Forget" only**, no "Reassign to…".

Decided after design review:

13. **Enabled scripts whose file is missing are no longer pruned.** The path stays in
    `enabledScripts`, the row is shown as "missing", and the script loads when its file
    appears. This changes current behaviour (`Settings.ts:154-159`).
14. **Secret values are non-enumerable.** They are read through lazy getters, so they do
    not appear in spreads, `JSON.stringify`, `onChange` payloads or `loadData()` copies.
15. **An open settings modal re-renders** when its script's values change externally.
16. **Only values that differ from the current default are stored.** A value equal to the
    default follows future default changes.
17. **A loaded script moved out of the scripts folder is unloaded and disabled.** Its
    values are kept as orphans under the old path.
18. **On a rename collision, the renamed script's values win**; orphaned values at the
    target path are discarded.
19. **Legacy top-level keys are left alone.** Keys that plugin-class scripts wrote into
    the host's `data.json` are kept untouched; release notes explain the change.
20. **Large stored data only warns.** A console warning when one script's stored values
    exceed 100 KB; no hard cap.

## Recommended design (summary)

- A file script exports `settings`, a plain object that maps each key to a field spec
  (`text`, `textarea`, `number`, `slider`, `toggle`, `dropdown`, `folder`, `secret`).
  Key order is display order.
- The host reads the schema right after it evaluates the file and before it calls
  `onload`. The schema is therefore known even if `onload` throws, for example because
  an API key is missing.
- Module scripts get a second `onload` argument, `ctx: ScriptContext`. It provides a live
  `ctx.settings` (defaults merged with stored values, secrets resolved), `ctx.set()`, and
  `ctx.onChange(cb)`. Listeners are removed automatically on unload.
- Plugin-class scripts use the Obsidian idiom: `await this.loadData()` returns the merged
  values, and `onExternalSettingsChange()` is called when the user edits them.
- The UI is a gear button on the script's row in the existing Scripts list. It opens a
  modal with one `Setting` row per field. It behaves the same on desktop and mobile.
- Changing a value does not re-run `onload`. Scripts read values when they need them or
  subscribe to changes. Toggling the script off and on (which already re-runs it) is the
  explicit reload.

## Current behaviour that matters

| Fact | Where |
|---|---|
| Persisted shape is `{ snippets, scriptsFolder, enabledScripts, ribbonIconEnabled }` | `src/settings/Settings.ts:7-12` |
| Loaded by shallow `Object.assign` over defaults; arrays copied so defaults aren't mutated; unknown keys in `data.json` are preserved and re-saved | `src/settings/Settings.ts:23-34`, `:36-38` |
| Whole object is written on every save | `src/settings/Settings.ts:37` |
| Settings loaded once in host `onload` | `src/main.ts:36` |
| A file script's identity is its vault path (`file.path`) stored in `enabledScripts` | `src/settings/Settings.ts:130-137` |
| Only `.js` files get a row/toggle | `src/settings/Settings.ts:125` |
| Enabled paths not found in the folder are pruned when the tab renders, so a renamed script is silently disabled | `src/settings/Settings.ts:123-159` |
| No vault `rename`/`delete` handling; the only registered events are window open/close | `src/main.ts:48-57` |
| Toggle on → `runJsModule(path)` re-reads and re-evaluates the file; off → `runOnunload(path)`; the whole tab is re-rendered via `display()` *before* the (un-awaited) load | `src/settings/Settings.ts:138-144` |
| The loader and the tab hold the settings object by reference | `src/main.ts:37-40`, `src/loaders/cjsModuleLoader.ts:30`, `src/settings/Settings.ts:122` |
| Loading a missing path raises a Notice | `src/loaders/cjsModuleLoader.ts:72-77` |
| File evaluated with `module`, `exports`, `require` via `Function` | `src/loaders/evaluateCjs.ts:9-17`, `src/loaders/cjsModuleLoader.ts:84-85` |
| Module type: `exports.onload(this.plugin)` (host instance), tracked for unload only if `onunload` exists | `src/loaders/cjsModuleLoader.ts:100-107` |
| Plugin type: `new exports.default(this.app, this.plugin.manifest)`, i.e. **the host's manifest**; then `onload()` called directly | `src/loaders/cjsModuleLoader.ts:108-117` |
| Plugin type unload calls `onunload()` directly, not `unload()` | `src/loaders/cjsModuleLoader.ts:159-160` |
| Loaded scripts tracked as `[path, module]` pairs, only after `onload` succeeds (modules only if they have `onunload`) | `src/loaders/cjsModuleLoader.ts:27`, `:101-117`, `:136-146` |
| Snippets: `Function("plugin","require", body)`, identified only by array index | `src/loaders/cjsModuleLoader.ts:43-64`, `src/settings/Settings.ts:166-199` |
| Text inputs save on every keystroke | `src/settings/Settings.ts:181-184` |
| Host scripts unload under a 5 s timeout | `src/main.ts:13`, `:97-113` |
| A folder suggester already exists and works in popout windows | `src/settings/suggesters/FolderSuggester.ts:7-12` |
| Plugin is not desktop-only | `manifest.json` (`isDesktopOnly: false`) |
| No test runner or tests; CI only builds on tag | `package.json` scripts, `.github/workflows/release.yml` |

Two consequences:

- **Plugin-class `loadData`/`saveData` hazard.** Obsidian's `Plugin.loadData`/`saveData`
  use `data.json` in `manifest.dir`. The user plugin is constructed with the host's
  manifest (`cjsModuleLoader.ts:109-112`), so a plugin-class script that calls
  `this.saveData({...})` today overwrites the host's settings (snippets and enabled
  scripts). This is likely part of why the README says settings are unsupported.
- **Rename already loses state.** Rename loses the enabled flag today. If per-script
  values copied that pattern, a rename would lose them too, so the design adds rename handling.

## Declaring settings

### Schema

```ts
// src/scriptSettings/types.ts (new)
interface FieldBase {
    /** Label; defaults to the key. */
    name?: string;
    desc?: string;
    /** Return an error message to reject a value; runs after built-in checks. */
    validate?: (value: unknown) => string | null | undefined;
}

export type SettingField = FieldBase &
    (
        | { type: "text"; default?: string; placeholder?: string; pattern?: string }
        | { type: "textarea"; default?: string; placeholder?: string; rows?: number }
        | { type: "number"; default?: number; min?: number; max?: number; integer?: boolean }
        | { type: "slider"; default?: number; min: number; max: number; step?: number }
        | { type: "toggle"; default?: boolean }
        | { type: "dropdown"; options: string[] | Record<string, string>; default?: string }
        | { type: "folder"; default?: string }   // vault folder path, FolderSuggester
        | { type: "secret" }                     // no default by design
    );

/** Key order = display order. Keys: /^[A-Za-z_][A-Za-z0-9_]*$/, excluding
 *  `__proto__`, `constructor` and `prototype`. */
export type SettingsSchema = Record<string, SettingField>;
```

**Defaults.** These apply when a field has no `default`: `""` for text, textarea, folder
and secret; `false` for toggle; `min ?? 0` for number and slider; the first option for
dropdown.

**Validation** happens in three places:

- **When the schema is read.** If the schema is malformed (unknown `type`, a dropdown
  default that is not one of its options, `min > max`, a bad or reserved key), the whole schema is
  rejected. The host logs it with `logScriptError`, shows no gear, and loads the script
  as usual.
- **On input.** The field's type and constraints are checked first, then `validate`.
  An invalid value is shown inline with its message and is not saved.
- **On read.** A stored value that no longer fits the schema (for example after the
  script's schema changed) is replaced by the default in `ctx.settings`. The stored
  value stays untouched until the user saves that field.

Deferred field types: list/array, file picker, color, hotkey, moment format. They are easy
to add later because each one is a single renderer plus a validator.

### Per script type

| Type | Declares via | In scope |
|---|---|---|
| Module (`module.exports = { onload, onunload }`) | `module.exports.settings = {...}` | Yes |
| Plugin class (`export default class extends Plugin`) | `export const settings = {...}` (CJS: `module.exports.settings`); also accepted: `static settings` on the class | Yes |
| Snippet | n/a | **No** |

Snippets are out of scope for three reasons:

- **No stable identity.** A snippet is identified only by its array index, and deleting
  one shifts the index of every snippet after it (`Settings.ts:195`).
- **No export surface.** The body runs as a bare function (`cjsModuleLoader.ts:45`).
- **Little to gain.** A snippet already lives inside the settings, so the user can edit
  its constants where they are.

The documented migration is to move the snippet into a file in the scripts folder.

## Storage

```ts
// addition to src/settings/Settings.ts
export interface ScriptSettingsEntry {
    /** Field key → stored value. For secret fields: the SecretStorage id. */
    values: Record<string, unknown>;
}

export interface Settings {
    snippets: Array<string>;
    scriptsFolder: string;
    enabledScripts: Array<string>;
    ribbonIconEnabled: boolean;
    /** Keyed by normalized vault path, same as enabledScripts. */
    scriptSettings: Record<string, ScriptSettingsEntry>;
}
```

`DEFAULT_SETTINGS.scriptSettings = {}`. The constructor must copy this object, as it
already does for the arrays (`Settings.ts:24-31`). `scriptSettings` and each `values`
map are created with `Object.create(null)` (and rebuilt that way when loaded), so a path
or key can never reach `Object.prototype`.

**Only non-default values are stored** (decision 16). On every write, a value equal to
the field's current default is removed from `values`. Keys outside the schema
(plugin-class "other keys") are stored as given. When a script's serialized `values`
exceed 100 KB the host logs a console warning (decision 20); large data belongs in vault
files, which the README will say.

**Why `data.json` and not a sidecar file** (for example `foo.js.settings.json`):

- A scripts folder is often a git repo or is shared. Values (folders, account names)
  belong to the user, not to the script, and must not travel when the script is shared.
  That is the whole point of making scripts shareable.
- Obsidian does not move a sidecar when the user renames the script. The rename handler
  below works for both designs, so the sidecar gains nothing there.
- A single write path keeps it simple: `saveData` is already in place, and Obsidian Sync
  handles `data.json`.

### Rename, move, delete

- The host registers `this.app.vault.on("rename", (file, oldPath) => ...)` in `main.ts`.
  The handler re-keys every path that equals `oldPath` or starts with `oldPath + "/"`,
  which covers folder moves. It applies to `enabledScripts`, `scriptSettings`, and the
  loader's script registry (see [Lifecycle](#reading-values-and-change-notification)),
  so that toggling the renamed script off still unloads it. Then it saves. This also
  fixes today's loss of the enabled flag on rename.
- **Renaming the scripts folder itself** also updates `scriptsFolder`, so the scripts stay
  in the folder and nothing is lost.
- **The path is mutable inside the host.** `ctx.path` and the plugin-class
  `loadData`/`saveData` overrides read the path from the registry entry on each call,
  never from a captured string, so they keep working after a rename.
- **A loaded script moved out of the scripts folder** is unloaded and removed from
  `enabledScripts`. Its values stay under the old path as orphans (decision 17).
- **Collision.** If the new path already holds orphaned values, the renamed script's
  values replace them (decision 18).
- **Delete, or the file is missing:** values are *kept*, and an enabled path is *not*
  pruned from `enabledScripts` (decision 13; today it is, `Settings.ts:154-159`). The
  row is shown as "missing" with its toggle, so the user can still disable it. Loading a
  missing path no longer raises a Notice (`cjsModuleLoader.ts:72-77`); instead the host
  listens for vault `create` and loads an enabled script when its file appears. This
  matters with sync: a file that has not synced yet must not disable the script on
  every device. Values are kept because sync clients often delete a file and recreate
  it, and because a deleted API-key setup is costly to redo.
- A collapsed **"Settings for missing scripts"** section at the bottom of the Scripts
  list shows each orphaned path with a "Forget" button. If a rename happened while the
  host was not running, the values are orphaned. In v1 the user re-enters them.
  A path counts as orphaned when it has values but is not enabled and has no file;
  missing *enabled* scripts are listed in the Scripts list instead.

### Schema changes between script versions

- Values are keyed by field key. A key that disappears from the schema is **kept**, not
  deleted, so downgrading the script or temporarily removing a field loses nothing. The
  modal has a "Clear unused values" action.
- If a field's type changes, the stored value fails validation and the script sees the
  default (see [Schema](#schema)).
- Renaming a key is not supported: the script sees the new key's default. Keeping keys
  compatible is the script author's responsibility (decision 9).

## Secrets

`data.json` is plain text and is often synced or committed. A `secret` field never
writes the secret itself there.

- The field is rendered with Obsidian's `SecretComponent`
  (`obsidian.d.ts`: `class SecretComponent`, since 1.11.1; its `setValue`/`onChange`
  since 1.11.4). The user picks an existing
  entry in `app.secretStorage` or creates one. `values[key]` stores only the secret id,
  for example `"openai-key"`. Ids must be lowercase alphanumeric with dashes
  (`setSecret` throws otherwise); `SecretComponent` enforces this when creating one.
- `ctx.settings.apiKey` resolves the id with `app.secretStorage.getSecret(id)` (which is
  synchronous) each time it is read, and returns `""` if no secret is set. Secret keys
  are defined as **non-enumerable getters** (decision 14), on both `ctx.settings` and the
  object `loadData()` returns. They are skipped by spreads, `Object.keys`,
  `JSON.stringify` and `onChange` payloads, so a logged settings object never contains a
  secret. Because each read calls `getSecret`, the value is never stale.
- `SecretStorage` has no change event, so editing a secret in Obsidian's own settings
  does **not** fire `onChange`. Scripts should read secrets at use time. Picking a
  *different* secret id in the modal does fire `onChange`.
- If the stored id has no secret on this device (for example after `data.json` synced
  but the secret did not), the modal shows "Secret not set on this device". `ctx.set()` refuses secret keys, and
  plugin-class `saveData` ignores them. Secrets are changed only through the UI.
- `minAppVersion` is 1.11.4 (decision 3), so the API is always present. There is no
  localStorage or plain-text fallback.
- The host never logs values of secret fields, including in validation errors.
- Threat model, to be stated in the README: this protects secrets against leaking through
  `data.json`. It does **not** protect them against other scripts, which run with full
  app access.
- To verify in stage 3: whether SecretStorage contents are device-local or synced by
  Obsidian Sync. This changes the documentation, not the design.

## Reading values and change notification

```ts
// src/scriptSettings/ScriptContext.ts (new)
export interface ScriptContext<V extends Record<string, unknown> = Record<string, unknown>> {
    /** Current vault path of the script; follows renames. */
    readonly path: string;
    /** Frozen snapshot: defaults ⊕ valid stored values. Secret keys are
     *  non-enumerable getters resolved on every read.
     *  The getter returns the current snapshot; a destructured copy goes stale. */
    readonly settings: Readonly<V>;
    /** Validates, persists (debounced), and notifies listeners. Rejects for
     *  unknown keys, invalid values and secret fields. */
    set<K extends keyof V>(key: K, value: V[K]): Promise<void>;
    /** Called after a value changes (UI, ctx.set, or external data.json change). Returns an unsubscribe function. Cleared on unload. */
    onChange(cb: (settings: Readonly<V>, changedKeys: Array<keyof V>) => void): () => void;
}
```

Lifecycle:

- **When the script is evaluated**, the host captures `exports.settings` or
  `exports.default?.settings` and validates it. This happens between
  `cjsModuleLoader.ts:85` and `:100`.
- **Before `onload`**, the host creates a registry entry for the path:
  `{ path, schema, ctx, exports/instance }`. The registry is separate from
  `modulesWithUnload`, which today records a script only after `onload` succeeds and a
  module only if it has `onunload` (`cjsModuleLoader.ts:101-117`). Every evaluated
  script gets an entry, including scripts without a schema, modules without
  `onunload`, and scripts whose `onload` threw. So the gear is shown for a script that
  failed to load because, say, its API key is missing, and its listeners are still
  disposed on toggle-off. Toggle-off disposes the entry whether or not `onload`
  succeeded; re-enabling creates a fresh one, never a second live one.
- **When the user edits a value**, the host validates it, writes it to `scriptSettings`,
  and debounces the save (about 500 ms) so a keystroke does not cause a full
  `data.json` write. Text inputs save on every keystroke today (`Settings.ts:181-184`).
  It also debounces the `onChange` notification, so scripts are not called on every
  keystroke. Closing the modal flushes the pending save immediately, because quitting
  Obsidian may not wait for an async `onunload`.
- **When `data.json` changes externally** (decision 10, the host's
  `onExternalSettingsChange`):
  1. Flush any pending debounced save first, so local edits are not lost.
  2. Read `data.json`. If it equals the JSON the host last wrote, it is an echo of the
     host's own write: stop.
  3. Apply the new data **in place** to the existing settings object (replace the
     contents of `snippets`, `enabledScripts`, `scriptSettings` and the scalar fields),
     because the loader and the tab hold it by reference (`main.ts:37-40`,
     `cjsModuleLoader.ts:30`, `Settings.ts:122`).
  4. For each script whose effective values changed, fire its `onChange` (module) or
     `onExternalSettingsChange` (plugin class).
  5. Load newly enabled scripts and unload newly disabled ones.
  6. Re-render the settings tab if it is open, and re-render an open
     `ScriptSettingsModal` (decision 15).
- **On unload** (toggle off, host unload): listeners are cleared and the context is
  marked disposed, after which `set` rejects. In the host's `onunload` (`main.ts:97`),
  scripts unload first, under the existing 5 s timeout, so writes made in their
  `onunload` are kept. Then pending saves are flushed and *every* context is marked
  disposed, including those of scripts still running after the timeout, so a late
  `set`/`saveData` rejects instead of writing after the host is gone.
- **Values are not deleted when a script is disabled.**
- **No automatic re-run of `onload` on change.** Re-running is unsafe: module scripts
  register on the *host* plugin, and nothing undoes those registrations except the
  script's own `onunload`. The plugin-class path never calls `unload()`
  (`cjsModuleLoader.ts:160`), so `register*` cleanups do not run either. Repeated
  `onload` calls would stack event handlers. Toggling the script off and on remains the
  explicit reload.

### Module type

`onload(plugin, ctx)` and `onunload(plugin, ctx)`. The `UserModule` type
(`cjsModuleLoader.ts:11-14`) gains the second parameter. Existing one-argument scripts are unaffected.

```js
module.exports = {
    settings: {
        inbox:  { type: "folder", name: "Inbox folder", default: "Inbox" },
        apiKey: { type: "secret", name: "API key" },
        limit:  { type: "number", name: "Max results", default: 10, min: 1, max: 100, integer: true },
    },
    async onload(plugin, ctx) {
        plugin.addCommand({
            id: "capture",
            name: "Capture to inbox",
            callback: async () => {
                const { inbox, apiKey, limit } = ctx.settings; // read at use time
                if (!apiKey) return plugin.api.notify("Set an API key in User Plugins settings");
                // ...
            },
        });
        ctx.onChange((s, changed) => console.log("settings changed:", changed));
    },
};
```

### Plugin-class type

The host overrides `loadData` and `saveData` on the instance before calling `onload`.
This is safe because `Plugin.loadData`/`saveData` are ordinary prototype methods.

```ts
loadData(): Promise<Record<string, unknown> | null>; // defaults ⊕ stored, secrets resolved; null if no schema and nothing stored
saveData(data: Record<string, unknown>): Promise<void>; // schema keys validated, secret keys ignored, defaults dropped, other keys stored as-is
onExternalSettingsChange?(): void; // existing Obsidian hook, called when values change from outside this instance
```

Without a schema, `loadData`/`saveData` still give the script private storage, but no UI.

`onExternalSettingsChange` is called for changes from the modal or from sync, never for
the instance's own `saveData`. This matches Obsidian's meaning of the hook and prevents
a loop when a script saves inside it.

Because only non-default values are stored (decision 16), the common
`saveData(this.cfg)` idiom does not freeze defaults: unchanged fields keep following the
schema's default.

```ts
import { Plugin } from "obsidian";

export const settings = {
    folder: { type: "folder", name: "Target folder", default: "" },
    openAfter: { type: "toggle", name: "Open note after creating", default: true },
};

export default class MyPlugin extends Plugin {
    cfg: { folder: string; openAfter: boolean };
    async onload() {
        this.cfg = (await this.loadData()) as typeof this.cfg;
        this.addCommand({ id: "new", name: "New note", callback: () => this.create() });
    }
    async onExternalSettingsChange() {
        this.cfg = (await this.loadData()) as typeof this.cfg;
    }
    async create() { /* uses this.cfg.folder */ }
}
```

TypeScript authors have no package to import these types from. In stage 5 the types will
be published as a copy-paste `.d.ts` in `examples/` (decision 11).

### Snippets

Unchanged. See [Per script type](#per-script-type).

## UI

- **Gear button.** In `addUserScriptEntries` (`Settings.ts:126-147`), a row gets an extra
  `settings` icon button before its toggle when the script has a registry entry with a
  valid schema (even if its `onload` threw). The toggle handler must `await
  runJsModule(...)` before calling `display()`; today `display()` runs first and the
  load is not awaited (`Settings.ts:139-141`), so the gear would not appear until the
  next render. A disabled script with stored values shows a muted "Enable to configure" description instead.
- **The button opens `ScriptSettingsModal`**, a `Modal` with the file name as title and
  one `Setting` per field, built with the stock builders (`addText`, `addTextArea`,
  `addToggle`, `addDropdown`, `addSlider`, `addSearch` with `FolderSuggester`, and
  `addComponent` with `SecretComponent`). The footer has "Reset to defaults" and "Clear
  unused values".
- **Why a modal instead of an inline expansion:**
  - The tab calls `display()` and rebuilds everything on every toggle (`Settings.ts:139`),
    which would collapse inline sections unless their state were tracked.
  - Long schemas would bury the script list.
  - On mobile a modal opens as a full-screen sheet with proper keyboard handling. The
    stock `Setting` rows already stack on narrow screens, so no custom CSS is planned.
- **Missing scripts.** A "Settings for missing scripts" section goes after the Scripts
  list (see [Rename, move, delete](#rename-move-delete)).
- **The tab's layout stays as it is.** `SettingGroup` (since 1.11.0) is not required.

## Backward compatibility

- **Persisted shape.** `scriptSettings` is a new optional key. Older `data.json` files
  load it as `{}`. Older plugin versions keep and re-save unknown keys because of the
  `Object.assign` merge and the whole-object save (`Settings.ts:25-37`), so a downgrade
  does not destroy values.
- **Module scripts.** The extra `ctx` argument is ignored by existing code. Scripts
  without a `settings` export see no change.
- **Plugin-class scripts.** `loadData`/`saveData` change from the host's `data.json` to
  private storage. A script that relied on reading the host's settings would break; none
  of the examples do (`examples/`). A script that called `saveData` has been corrupting
  the host's settings and is fixed by this change. It will be called out in release notes.
  Data such a script already wrote lives as stray top-level keys in the host's
  `data.json`. These keys are left untouched (decision 19), and the script will not see
  them through the new `loadData`. Release notes explain how to copy them over by hand.
- **Missing enabled scripts are no longer pruned** (decision 13). A script whose file is
  gone stays enabled and shows as "missing" until the user disables it.
- **Accidental `settings` export.** If a script already exports an unrelated `settings`,
  strict validation rejects it with a console message. The script loads as before. See
  decision 7.
- **`minAppVersion`** rises from 1.7.2 to 1.11.4 (decision 3), for `SecretStorage` and
  `addComponent`. Users on older Obsidian stay on the previous release. Called out in
  release notes; `versions.json` maps the new version to 1.11.4.

## Alternatives considered

| Alternative | Why not (now) |
|---|---|
| **Imperative hook only** (`renderSettings(containerEl, ctx)` / `Setting` builder) | Every script would reimplement persistence, defaults and validation. The host can't know which values are secrets, so it can't keep them out of `data.json`. Mobile layout and error handling would be left to each script, and the host would run script DOM code inside its own settings tab, where a throw breaks the tab. It stays available as a later, opt-in escape hatch layered on `ctx`. |
| **Let plugin-class scripts call `addSettingTab`** | Each script would get a top-level entry in Obsidian's settings sidebar that collides with the host's tab id, because they share a manifest (`cjsModuleLoader.ts:111`). It doesn't help module scripts. |
| **Sidecar values file next to the script** | It leaks user values when a scripts folder is shared, and it needs the same rename handling anyway. See [Storage](#storage). |
| **Separate file per script under the host plugin folder** | It gives the same privacy as `data.json` but adds more writes, more files to sync, and no `onExternalSettingsChange` support from Obsidian. |
| **Evaluate disabled scripts to read their schema** | That runs top-level script code the user hasn't enabled. |
| **Static parse of the schema (JSON comment header / front-matter)** | It can't express `validate`, it duplicates JS syntax in a mini-format, and evaluation already happens on load. |
| **Auto re-run `onload` on change** | It is unsafe without reliable cleanup. See [Lifecycle](#reading-values-and-change-notification). |
| **Plain-text secrets with a warning, or localStorage fallback** | The first leaks secrets through sync. The second is a second code path, and secrets are lost when switching devices. SecretStorage exists for exactly this. |

## Open questions

1. Should snippets eventually get a stable id (for example a name) so they can have
   settings? Not proposed here.

## Implementation plan

Rough sizes are production lines of code, excluding tests.

| Stage | Content | Size |
|---|---|---|
| 1. Core + storage | Raise `minAppVersion` to 1.11.4. `scriptSettings` in `Settings` and the defaults copy. Pure module `src/scriptSettings/schema.ts` (schema validation, value coercion, merge with defaults, path re-keying; imports no `obsidian`). Vault `rename` handler re-keying `enabledScripts`, `scriptSettings`, the script registry and `scriptsFolder`; unload on move out of the folder. Stop pruning missing enabled scripts; load on vault `create`. Null-prototype maps; store only non-defaults; size warning. Debounced save with flush on modal close and after script unload. Test harness. | ~250 |
| 2. Module scripts + UI | Schema capture after evaluation, script registry, `ScriptContext` (`settings`, `set`, `onChange`, dispose), `onload(plugin, ctx)`. Await load before `display()`. Gear button, `ScriptSettingsModal` with the non-secret renderers, missing-scripts section. | ~400 |
| 3. Secrets | `secret` field with `SecretComponent`/`SecretStorage`, non-enumerable getters, "not set on this device", redaction in logs. Verify SecretStorage sync behaviour. | ~120 |
| 4. Plugin-class scripts | `loadData`/`saveData` override, schema from `exports.settings`/`static settings`, `onExternalSettingsChange` dispatch (not to the saving instance). | ~80 |
| 4b. External changes | Host `onExternalSettingsChange`: flush, echo check, in-place apply, fire script `onChange`, load/unload scripts whose `enabledScripts` entry changed, re-render tab and modal. | ~120 |
| 5. Docs + examples | `examples/js-module-settings/`, a plugin-class example, the `.d.ts` for authors. README: tick the roadmap item, replace the warning at `README.md:15`, document the secrets threat model, the `loadData` change and legacy keys, no-pruning, large-data guidance, and the new minimum Obsidian version. | docs |
| Later (optional) | Imperative `renderSettings(containerEl, ctx)`. | ~100 |

Each of stages 1–4b can ship as its own PR. Stage 1 ships no user-visible feature apart
from the rename fix and the end of pruning.

## Testing approach

There is no test infrastructure today: `package.json` has only `dev`, `build`, `lint`,
and `version`, there are no test files, and CI runs only `npm ci && npm run build` on tag
pushes (`.github/workflows/release.yml`).

- **Unit tests (stage 1).** Keep schema validation, coercion, merging and re-keying in
  modules that import nothing from `obsidian`. Test them with Node's built-in `node:test`
  runner. The test files are bundled with the `esbuild` already in `devDependencies` and
  run as `npm test` (`esbuild test/*.test.ts --bundle --platform=node --outdir=build-test && node --test build-test/*.test.js`).
  This needs no new dependencies. CI pins the Node version (`actions/setup-node`), and a
  `tsconfig.test.json` that includes `test/` is type-checked with `tsc --noEmit`, since
  `test/` is outside the main `tsconfig` include. `vitest` is the alternative if a dev dependency is
  acceptable. Add `npm test` to a PR workflow, which is new and gated on approval.
- **Cases to cover:**
  - malformed schemas of each kind
  - defaults per type
  - an invalid stored value falling back to the default without being overwritten
  - unknown keys preserved
  - file and folder renames re-keying `enabledScripts`, `scriptSettings` and the registry
  - renaming the scripts folder updating `scriptsFolder`
  - a rename onto a path with orphaned values (renamed script wins)
  - delete keeping values; a missing enabled path not being pruned
  - reserved keys (`__proto__`, `constructor`) rejected
  - only non-default values stored; a changed default taking effect
  - secret keys never appearing in the serialized `Settings`, spreads or `JSON.stringify(ctx.settings)`
  - `ctx.set` rejecting secrets and invalid values
  - listener disposal on unload, including after a failed `onload`
  - external reload applied in place (object identity kept) and echo writes ignored
  - a pending debounced save flushed before an external reload
  - `set` rejecting after host unload
  - plugin-class `saveData` inside `onExternalSettingsChange` not recursing
- **Manual checklist** (in the PR description for stages 2–4), using the new examples on
  desktop and on mobile (Android or iOS):
  - edit each field type
  - rename and move the script
  - delete it and restore it
  - toggle it off and on
  - unload the host with a save pending
  - use a secret field
  - change a value and `enabledScripts` from another synced device
  - a plugin-class script round-tripping `loadData`/`saveData` without touching the
    host's snippets
