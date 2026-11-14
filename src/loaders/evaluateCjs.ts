export interface CjsModule<T = unknown> {
    exports: T;
}

/**
 * Runs CommonJS source with `module`, `exports` and the plugin's `require`,
 * and returns the module object. `sourceURL` is the name shown in stack traces.
 */
export function evaluateCjs<T extends object>(
    source: string,
    sourceURL: string
): CjsModule<T> {
    const module = { exports: {} as T };
    Function(
        "module",
        "exports",
        "require",
        `${source}\n//# sourceURL=${sourceURL}`
    )(module, module.exports, require);
    return module;
}
