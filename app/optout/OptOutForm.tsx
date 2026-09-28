"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { removeSubmission, type OptOutState } from "./actions";

export function OptOutForm() {
  const [state, action, pending] = useActionState<OptOutState, FormData>(removeSubmission, { status: "idle" });

  if (state.status === "done") {
    return (
      <p role="status" className="mt-10 flex items-center gap-2 text-base text-ink">
        <span aria-hidden className="size-1.5 rounded-full bg-ok" />
        Removed. Your submission is hidden from the dashboard.
      </p>
    );
  }

  return (
    <form action={action} className="mt-10 flex max-w-lg flex-col gap-3">
      <label htmlFor="username" className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
        GitHub username
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="username"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="alice-chen"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? "optout-error" : undefined}
          className="h-11 flex-1 rounded-btn border border-line bg-surface px-3 text-sm text-ink placeholder:font-mono placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Removing..." : "Remove my submission"}
        </Button>
      </div>
      {state.status === "error" && (
        <p id="optout-error" role="alert" className="text-sm text-fail">
          {state.message}
        </p>
      )}
    </form>
  );
}
