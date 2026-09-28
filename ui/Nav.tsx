"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./Button";
import { cx } from "./cx";

const LINKS = [
  { href: "/", label: "Submissions", match: (p: string) => p === "/" || p.startsWith("/s/") },
  { href: "/stats", label: "Stats", match: (p: string) => p.startsWith("/stats") },
  { href: "/how", label: "How it works", match: (p: string) => p.startsWith("/how") },
];

const linkClass =
  "font-mono text-xs font-semibold uppercase tracking-[0.04em] transition-colors duration-150";

/** Sticky glass nav: translucent background, 12px backdrop blur, 1px bottom border. */
export function Nav() {
  const pathname = usePathname();
  // The menu is open for one pathname; navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <header
      className="sticky top-0 z-40 border-b border-line"
      style={{ background: "var(--glass)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-btn focus:bg-accent focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-14 w-full max-w-content items-center gap-8 px-4 md:px-8">
        <Link href="/" className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">
          Solari Screener
        </Link>

        <ul className="ml-auto hidden items-center gap-7 md:flex">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    linkClass,
                    "border-b-2 py-1",
                    active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/optout"
              aria-current={pathname.startsWith("/optout") ? "page" : undefined}
              className={buttonClass("ghost", "px-3 py-2 text-[13px]")}
            >
              Opt out
            </Link>
          </li>
        </ul>

        <button
          type="button"
          className="ml-auto grid size-9 place-items-center rounded-btn border border-line-strong text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            {open ? (
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
            ) : (
              <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-line md:hidden">
          <ul className="mx-auto flex max-w-content flex-col px-4 py-2">
            {[...LINKS, { href: "/optout", label: "Opt out", match: (p: string) => p.startsWith("/optout") }].map(
              (l) => {
                const active = l.match(pathname);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(linkClass, "block py-3", active ? "text-accent" : "text-ink-muted")}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              },
            )}
          </ul>
        </div>
      )}
    </header>
  );
}
