const PREFIX = "[obsidian-user-plugins]";

export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export function logError(msg: string) {
    console.error(`${PREFIX} ${msg}`);
}

export function logScriptError(msg: string, error: unknown) {
    const stack = error instanceof Error ? error.stack : undefined;
    logError(stack ? `${msg}. stacktrace: ${stack}` : msg);
}
