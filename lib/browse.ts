// How the submission list is filtered and ordered. Shared by the grid, the
// detail page's previous / next links and the review list, so "next" always
// means the next card in the list you came from.
import type { Product, Status, Submission } from "./types";

export type StatusFilter = "all" | "booted" | "running" | "failed" | "needs_secrets" | "skipped";
export type ProductFilter = "all" | Product;
export type Sort = "newest" | "score" | "boot" | "fork";

export interface BrowseState {
  status: StatusFilter;
  product: ProductFilter;
  q: string;
  sort: Sort;
}

export const DEFAULT_BROWSE: BrowseState = { status: "all", product: "all", q: "", sort: "newest" };

export const STATUS_FILTERS: { value: StatusFilter; label: string; statuses: Status[] | null }[] = [
  { value: "all", label: "All", statuses: null },
  { value: "booted", label: "Booted", statuses: ["booted"] },
  { value: "running", label: "In progress", statuses: ["running", "queued"] },
  { value: "failed", label: "Failed", statuses: ["build_failed", "timeout"] },
  { value: "needs_secrets", label: "Needs secrets", statuses: ["needs_secrets"] },
  { value: "skipped", label: "Skipped", statuses: ["skipped"] },
];

export const PRODUCT_FILTERS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "Any product" },
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

type Params = Record<string, string | string[] | undefined>;

export function parseBrowse(sp: Params): BrowseState {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const pick = <T extends string>(v: string, list: { value: T }[], fallback: T) =>
    list.some((o) => o.value === v) ? (v as T) : fallback;
  return {
    status: pick(one("status"), STATUS_FILTERS, "all"),
    product: pick(one("product"), PRODUCT_FILTERS, "all"),
    q: one("q").slice(0, 100),
    sort: pick(one("sort"), SORTS, "newest"),
  };
}

/** Query string for a state ("" for the defaults), e.g. "?status=booted&sort=score". */
export function browseQuery(s: BrowseState): string {
  const p = new URLSearchParams();
  if (s.status !== "all") p.set("status", s.status);
  if (s.product !== "all") p.set("product", s.product);
  if (s.q) p.set("q", s.q);
  if (s.sort !== "newest") p.set("sort", s.sort);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function matchesStatus(s: Submission, f: StatusFilter): boolean {
  const statuses = STATUS_FILTERS.find((o) => o.value === f)?.statuses;
  return !statuses || statuses.includes(s.status);
}

function matchesQuery(s: Submission, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [s.owner, s.title, s.description, ...s.stack.map((t) => t.name)].some((f) => f.toLowerCase().includes(needle));
}

export function sortSubmissions(subs: Submission[], sort: Sort): Submission[] {
  const byNewest = (a: Submission, b: Submission) => b.discoveredAt.localeCompare(a.discoveredAt) || a.forkNumber - b.forkNumber;
  const out = [...subs];
  switch (sort) {
    case "score":
      return out.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || byNewest(a, b));
    case "boot":
      return out.sort((a, b) => (a.bootMs ?? Infinity) - (b.bootMs ?? Infinity) || byNewest(a, b));
    case "fork":
      return out.sort((a, b) => a.forkNumber - b.forkNumber);
    default:
      return out.sort(byNewest);
  }
}

export function applyBrowse(subs: Submission[], s: BrowseState): Submission[] {
  const filtered = subs.filter(
    (x) =>
      matchesStatus(x, s.status) &&
      (s.product === "all" || x.productsUsed.includes(s.product) || x.demoProduct === s.product) &&
      matchesQuery(x, s.q),
  );
  return sortSubmissions(filtered, s.sort);
}

/** Counts per status filter, within the current product and search. */
export function statusCounts(subs: Submission[], s: BrowseState): Record<StatusFilter, number> {
  const base = applyBrowse(subs, { ...s, status: "all" });
  return Object.fromEntries(STATUS_FILTERS.map((f) => [f.value, base.filter((x) => matchesStatus(x, f.value)).length])) as Record<
    StatusFilter,
    number
  >;
}

/** Counts per product filter, within the current status and search. */
export function productCounts(subs: Submission[], s: BrowseState): Record<ProductFilter, number> {
  return Object.fromEntries(
    PRODUCT_FILTERS.map((f) => [f.value, applyBrowse(subs, { ...s, product: f.value }).length]),
  ) as Record<ProductFilter, number>;
}

/** Position of `owner` in the browsed list, with its neighbours. */
export function neighbours(subs: Submission[], s: BrowseState, owner: string) {
  const list = applyBrowse(subs, s);
  const i = list.findIndex((x) => x.owner.toLowerCase() === owner.toLowerCase());
  return {
    index: i,
    total: list.length,
    prev: i > 0 ? list[i - 1] : null,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
  };
}
