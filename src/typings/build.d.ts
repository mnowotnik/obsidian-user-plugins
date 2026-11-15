/** A file's contents, bundled as a string by esbuild.config.mjs. */
declare module "text:*" {
    const text: string;
    export default text;
}

/** Version of the obsidian package the bundled typings come from. */
declare const OBSIDIAN_TYPINGS_VERSION: string;
