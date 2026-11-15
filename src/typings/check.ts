// Compile-time checks that obsidian-user-plugins.d.ts (written into users'
// scripts folders) matches the plugin's code. `npm run build` type-checks
// this file; nothing here runs or is bundled.
import type { Plugin } from "obsidian";
import type UserPlugins from "src/main";
import type { Helpers } from "src/helpers/Helpers";
import type {
    ImportOptions,
    ImportType,
    StyleHandle,
} from "src/import/Importer";
import type { UserModule } from "src/loaders/cjsModuleLoader";
import type * as Declared from "./obsidian-user-plugins";

/** Each type is assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Same, with the same keys (Same alone misses an extra optional key). */
type Match<A, B> = Same<A, B> extends true ? Same<keyof A, keyof B> : false;
type Check<T extends true> = T;
/** Public members a class adds to Obsidian's Plugin. */
type OwnKeys<T> = Exclude<keyof T, keyof Plugin>;

export type TypingsMatchCode = [
    // the plugin's own members; the declared `api` can't be the Helpers
    // class (it has private members), so check the plugin one way only
    Check<Same<OwnKeys<UserPlugins>, OwnKeys<Declared.UserPlugins>>>,
    Check<UserPlugins extends Declared.UserPlugins ? true : false>,
    Check<Same<UserPlugins["import"], Declared.UserPlugins["import"]>>,
    // Pick drops the private members
    Check<Match<Pick<Helpers, keyof Helpers>, Declared.Helpers>>,
    Check<Match<ImportOptions, Declared.ImportOptions>>,
    Check<Same<ImportType, Declared.ImportType>>,
    Check<Match<StyleHandle, Declared.StyleHandle>>,
    Check<Match<UserModule, Declared.UserModule>>
];
