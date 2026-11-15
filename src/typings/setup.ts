import { App, normalizePath, TFile, TFolder } from "obsidian";
import obsidianTypings from "text:obsidian/obsidian.d.ts";
import obsidianLicense from "text:obsidian/LICENSE.md";
import userPluginsTypings from "text:./obsidian-user-plugins.d.ts";
import { getFolder } from "src/utils/vault";

/** Subfolder of the scripts folder that holds the declaration files. */
const TYPES_FOLDER = "types";

/** Starts every file this plugin owns; only such files are overwritten. */
const OWNED_MARKER = "// Written by User Plugins";
const OWNED_HEADER = `${OWNED_MARKER} ("Set up editor support"). Running it again replaces this file.\n`;

const OBSIDIAN_HEADER = `// Obsidian API type definitions from the "obsidian" npm package, version
// ${OBSIDIAN_TYPINGS_VERSION} (https://github.com/obsidianmd/obsidian-api), distributed under its licence:
/*
${obsidianLicense.trim()}
*/
`;

// obsidian.d.ts imports types from these packages, which aren't in the
// scripts folder. Each stand-in is `any` (also when a script requires the
// package itself), with `any` types for the names obsidian.d.ts imports.
const DEPENDENCY_STUBS = `// Stand-ins for packages that obsidian.d.ts imports types from. Everything
// they export is typed \`any\`. Scripts can still require() them at runtime.
declare module "@codemirror/state" {
    const state: any;
    namespace state {
        type Extension = any;
        type StateField<Value = any> = any;
    }
    export = state;
}
declare module "@codemirror/view" {
    const view: any;
    namespace view {
        type EditorView = any;
        type ViewPlugin<Value = any, Spec = any> = any;
    }
    export = view;
}
declare module "moment" {
    const moment: any;
    namespace moment {
        type Moment = any;
    }
    export = moment;
}
`;

/** Declaration files, by path relative to the scripts folder. */
const TYPINGS: Record<string, string> = {
    [`${TYPES_FOLDER}/obsidian.d.ts`]: OBSIDIAN_HEADER + obsidianTypings,
    [`${TYPES_FOLDER}/obsidian-user-plugins.d.ts`]: userPluginsTypings,
    [`${TYPES_FOLDER}/obsidian-dependencies.d.ts`]: DEPENDENCY_STUBS,
};

const JSCONFIG = "jsconfig.json";
/** Editors use a tsconfig.json over a jsconfig.json in the same folder. */
const TSCONFIG = "tsconfig.json";

export const JSCONFIG_CONTENT =
    JSON.stringify(
        {
            compilerOptions: {
                checkJs: true,
                // newer TypeScript versions default to strict
                strict: false,
                // a .js file is CommonJS (no package.json says otherwise),
                // so both require() and JSDoc import() types resolve
                module: "nodenext",
                moduleResolution: "nodenext",
                target: "es2022",
                lib: ["es2022", "dom", "dom.iterable"],
                // no @types from node_modules folders above the vault
                types: [],
                skipLibCheck: true,
                noEmit: true,
                paths: {
                    obsidian: [`./${TYPES_FOLDER}/obsidian.d.ts`],
                    "obsidian-user-plugins": [
                        `./${TYPES_FOLDER}/obsidian-user-plugins.d.ts`,
                    ],
                },
            },
            include: [
                "**/*.js",
                "**/*.mjs",
                "**/*.cjs",
                `${TYPES_FOLDER}/*.d.ts`,
            ],
        },
        null,
        4
    ) + "\n";

/** The files setUpEditorSupport writes, by path relative to the scripts folder. */
function editorSupportFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    for (const [path, content] of Object.entries(TYPINGS)) {
        files[path] = OWNED_HEADER + content;
    }
    files[JSCONFIG] = JSCONFIG_CONTENT;
    return files;
}

export interface SetupReport {
    /** Files created or updated. */
    written: string[];
    /** Files that already had the right content. */
    unchanged: string[];
    /** Files left alone, and why. */
    skipped: { path: string; reason: string }[];
}

/**
 * Writes type declarations and a jsconfig.json into the scripts folder, so
 * code editors (e.g. VS Code) can complete and type-check user scripts.
 * Declaration files this plugin wrote before are replaced; any other file is
 * never overwritten, so an existing jsconfig.json or tsconfig.json is left
 * as it is.
 */
export async function setUpEditorSupport(
    app: App,
    scriptsFolder: string
): Promise<SetupReport> {
    const root = getFolder(app, scriptsFolder).path;
    const pathIn = (path: string) =>
        normalizePath(root === "/" ? path : `${root}/${path}`);
    const report: SetupReport = { written: [], unchanged: [], skipped: [] };
    const files = editorSupportFiles();

    const typesFolder = pathIn(TYPES_FOLDER);
    const folder = app.vault.getAbstractFileByPath(typesFolder);
    if (!folder) {
        await app.vault.createFolder(typesFolder);
    } else if (!(folder instanceof TFolder)) {
        throw new Error(`${typesFolder} is a file, not a folder`);
    }

    for (const path of Object.keys(TYPINGS)) {
        const vaultPath = pathIn(path);
        const content = files[path];
        const current = await readIfExists(app, vaultPath);
        if (current === content) {
            report.unchanged.push(path);
        } else if (current == null || current.startsWith(OWNED_MARKER)) {
            await write(app, vaultPath, content);
            report.written.push(path);
        } else {
            report.skipped.push({
                path,
                reason: "it wasn't written by User Plugins",
            });
        }
    }

    const jsconfig = await readIfExists(app, pathIn(JSCONFIG));
    if (jsconfig === JSCONFIG_CONTENT) {
        report.unchanged.push(JSCONFIG);
    } else if (jsconfig != null) {
        report.skipped.push({ path: JSCONFIG, reason: "it already exists" });
    } else if (await app.vault.adapter.exists(pathIn(TSCONFIG))) {
        report.skipped.push({
            path: JSCONFIG,
            reason: `${TSCONFIG} exists, and editors would use it instead`,
        });
    } else {
        await write(app, pathIn(JSCONFIG), JSCONFIG_CONTENT);
        report.written.push(JSCONFIG);
    }
    return report;
}

/** The file's text, or null if nothing is at `path`. */
async function readIfExists(app: App, path: string): Promise<string | null> {
    if (!(await app.vault.adapter.exists(path))) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFolder) {
        throw new Error(`${path} is a folder, not a file`);
    }
    // a file Obsidian hasn't indexed yet is read straight from disk
    return file instanceof TFile
        ? app.vault.read(file)
        : app.vault.adapter.read(path);
}

/** Writes through the vault, so its index and other plugins see the file. */
async function write(app: App, path: string, content: string) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
        await app.vault.modify(file, content);
    } else {
        await app.vault.create(path, content);
    }
}

/** A one-paragraph summary of a SetupReport, for a Notice. */
export function describeSetup(scriptsFolder: string, report: SetupReport) {
    const lines = [`Editor support for ${scriptsFolder}:`];
    if (report.written.length) {
        lines.push(`wrote ${report.written.join(", ")}.`);
    }
    if (report.unchanged.length) {
        lines.push(`${report.unchanged.join(", ")} already up to date.`);
    }
    for (const { path, reason } of report.skipped) {
        lines.push(`Left ${path} unchanged: ${reason}.`);
    }
    if (report.skipped.some(({ path }) => path === JSCONFIG)) {
        lines.push(
            "See the developer console for the settings your config needs."
        );
    }
    return lines.join(" ");
}
