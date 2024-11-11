export interface Loader {
    onload(): Promise<void>;
    onunload(): Promise<void>;
}
