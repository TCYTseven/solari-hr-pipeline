// Filter state for the submission grid, shared by the server page and the client grid.
import type { Product } from "@/lib/types";

export type Tab = "all" | Product;
export type Sort = "newest" | "score" | "boot" | "fork";

export interface BrowserState {
  tab: Tab;
  q: string;
  sort: Sort;
  booted: boolean;
}

export const DEFAULT_STATE: BrowserState = { tab: "all", q: "", sort: "newest", booted: false };

export const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "browser", label: "Browser" },
  { value: "sandbox", label: "Sandbox" },
  { value: "desktop", label: "Desktop" },
];

export const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "score", label: "Top score" },
  { value: "boot", label: "Fastest boot" },
  { value: "fork", label: "Fork number" },
];

export function parseState(sp: Record<string, string | string[] | undefined>): BrowserState {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const tab = one("tab");
  const sort = one("sort");
  return {
    tab: TABS.some((t) => t.value === tab) ? (tab as Tab) : "all",
    q: one("q"),
    sort: SORTS.some((s) => s.value === sort) ? (sort as Sort) : "newest",
    booted: one("booted") === "1",
  };
}
