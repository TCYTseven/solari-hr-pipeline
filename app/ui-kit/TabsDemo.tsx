"use client";

import { useState } from "react";
import { Tabs } from "@/ui/Tabs";

export function TabsDemo() {
  const [tab, setTab] = useState<"all" | "browser" | "sandbox" | "desktop">("all");
  return (
    <div className="border-b border-line">
      <Tabs
        label="Product filter"
        value={tab}
        onChange={setTab}
        items={[
          { value: "all", label: "All" },
          { value: "browser", label: "Browser" },
          { value: "sandbox", label: "Sandbox" },
          { value: "desktop", label: "Desktop" },
        ]}
      />
    </div>
  );
}
