"use client";

import { useState } from "react";
import type { LogTab } from "@/lib/types";
import { LogBlock } from "@/ui/LogBlock";
import { Tabs } from "@/ui/Tabs";

const ITEMS: { value: LogTab; label: string }[] = [
  { value: "install", label: "Install" },
  { value: "run", label: "Run" },
  { value: "demo", label: "Demo agent" },
];

/** Build log viewer with tabs styled like getsolari.com's code-sample tabs. */
export function LogTabs({ logs }: { logs: Record<LogTab, string> }) {
  const first = ITEMS.find((i) => logs[i.value]?.trim())?.value ?? "install";
  const [tab, setTab] = useState<LogTab>(first);
  const text = logs[tab]?.trim();
  return (
    <div>
      <div className="border-b border-line">
        <Tabs label="Logs" items={ITEMS} value={tab} onChange={setTab} idPrefix="logs" panelId="logs-panel" />
      </div>
      <div role="tabpanel" id="logs-panel" aria-labelledby={`logs-tab-${tab}`} className="mt-4">
        {text ? (
          <LogBlock text={text} maxHeight={520} label={`${tab} log`} />
        ) : (
          <p className="rounded-card border border-teal-700 bg-teal-900 p-4 font-mono text-[13px] text-ink-muted">
            No output for this stage.
          </p>
        )}
      </div>
    </div>
  );
}
