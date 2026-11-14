export interface CjsModule {
    exports: unknown;
}

/**
 * Runs CommonJS source with `module`, `exports` and the plugin's `require`,
 * and returns the module object. `sourceURL` is the name shown in stack traces.
 */
export function evaluateCjs(source: string, sourceURL: string): CjsModule {
    const mod: CjsModule = { exports: {} };
    Function(
        "module",
        "exports",
        "require",
        `${source}\n//# sourceURL=${sourceURL}`
    )(mod, mod.exports, require);
    return mod;
}
