"use client";

import { useState } from "react";
import type { LogTab } from "@/lib/types";
import { LogBlock } from "@/ui/LogBlock";
import { cx } from "@/ui/cx";

const ITEMS: { value: LogTab; label: string }[] = [
  { value: "install", label: "Install" },
  { value: "run", label: "Run" },
  { value: "demo", label: "Demo agent" },
];

/** Install / Run / Demo agent output, switched with a small segmented control. */
export function LogTabs({ logs }: { logs: Record<LogTab, string> }) {
  const first = ITEMS.find((i) => logs[i.value]?.trim())?.value ?? "install";
  const [tab, setTab] = useState<LogTab>(first);
  const text = logs[tab]?.trim();
  return (
    <div>
      <div role="tablist" aria-label="Log" className="inline-flex rounded-btn border border-line p-0.5">
        {ITEMS.map((i) => (
          <button
            key={i.value}
            type="button"
            role="tab"
            id={`logs-tab-${i.value}`}
            aria-selected={tab === i.value}
            aria-controls="logs-panel"
            tabIndex={tab === i.value ? 0 : -1}
            onClick={() => setTab(i.value)}
            onKeyDown={(e) => {
              const idx = ITEMS.findIndex((x) => x.value === tab);
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const nextTab = ITEMS[(idx + d + ITEMS.length) % ITEMS.length].value;
              setTab(nextTab);
              document.getElementById(`logs-tab-${nextTab}`)?.focus();
            }}
            className={cx(
              "rounded-[4px] px-3 py-1 text-[13px] transition-colors duration-150",
              tab === i.value ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
              !logs[i.value]?.trim() && tab !== i.value && "opacity-60",
            )}
          >
            {i.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="logs-panel" aria-labelledby={`logs-tab-${tab}`} className="mt-3">
        {text ? (
          <LogBlock text={text} maxHeight={480} label={`${tab} log`} />
        ) : (
          <p className="rounded-card border border-teal-700 bg-teal-900 p-4 font-mono text-[13px] text-ink-muted">
            No output for this stage.
          </p>
        )}
      </div>
    </div>
  );
}
