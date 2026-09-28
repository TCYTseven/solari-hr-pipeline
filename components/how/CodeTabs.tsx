"use client";

import { useState } from "react";
import { LogBlock } from "@/ui/LogBlock";
import { Tabs } from "@/ui/Tabs";

export interface CodeSample {
  value: string;
  label: string;
  file: string;
  code: string;
}

/** Code sample with product tabs, styled like getsolari.com's "Learn one client" block. */
export function CodeTabs({ samples }: { samples: CodeSample[] }) {
  const [tab, setTab] = useState(samples[0].value);
  const active = samples.find((s) => s.value === tab) ?? samples[0];
  return (
    <div className="overflow-hidden rounded-card border border-teal-700 bg-teal-900">
      <div className="flex items-end justify-between gap-4 border-b border-teal-700 px-4 pt-3">
        <Tabs
          label="SDK"
          items={samples.map((s) => ({ value: s.value, label: s.label }))}
          value={tab}
          onChange={setTab}
          idPrefix="code"
          panelId="code-panel"
        />
        <span className="hidden pb-2 font-mono text-xs text-ink-muted sm:block">{active.file}</span>
      </div>
      <div role="tabpanel" id="code-panel" aria-labelledby={`code-tab-${active.value}`}>
        <LogBlock text={active.code} mode="code" label={`${active.label} code sample`} variant="bare" />
      </div>
    </div>
  );
}
