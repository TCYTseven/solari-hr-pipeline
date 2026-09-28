// Tabs of the detail page's lower panel. Shared by the server page and the client workspace.

export type View = "summary" | "steps" | "timing" | "logs";
export const VIEWS: View[] = ["summary", "steps", "timing", "logs"];

/** Every page opens on the summary; failures show their error above it and the full log is one tab away. */
export const DEFAULT_VIEW: View = "summary";
