// Accumulates one run's logs, timings and steps and flushes them to Postgres
// progressively (throttled) so the live dashboard sees the run advance.
import type { DemoStep, LogTab, StageName, StageTiming } from "../lib/types";
import type { RunPatch, Store } from "./store";
import { capLog, cleanOutput, redact } from "./util";

export class RunRecorder {
  readonly logs: Record<LogTab, string> = { install: "", run: "", demo: "" };
  readonly timings: StageTiming[] = [];
  readonly steps: DemoStep[] = [];
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> = Promise.resolve();
  private pending: RunPatch = {};

  constructor(
    private store: Store | null,
    readonly runId: string,
    private secrets: string[],
    private echo?: (tab: LogTab, text: string) => void,
    private flushMs = 1500,
  ) {}

  log(tab: LogTab, text: string): void {
    if (!text) return;
    const clean = cleanOutput(text);
    this.logs[tab] = capLog(this.logs[tab] + clean);
    this.echo?.(tab, redact(clean, this.secrets));
    this.touch();
  }

  /** Logs as stored: redacted as a whole, so a secret split across chunks is still caught. */
  redactedLogs(): Record<LogTab, string> {
    return {
      install: redact(this.logs.install, this.secrets),
      run: redact(this.logs.run, this.secrets),
      demo: redact(this.logs.demo, this.secrets),
    };
  }

  /** A `$ cmd` line, highlighted by the dashboard. */
  cmd(tab: LogTab, command: string): void {
    const cur = this.logs[tab];
    this.log(tab, `${cur && !cur.endsWith("\n") ? "\n" : ""}$ ${command}\n`);
  }

  timing(surface: StageTiming["surface"], stage: StageName, ms: number | null): void {
    let row = this.timings.find((r) => r.surface === surface);
    if (!row) {
      row = { surface, create: null, clone: null, install: null, boot: null, demo: null, release: null };
      this.timings.push(row);
    }
    row[stage] = ms == null ? null : Math.round(ms * 10) / 10;
    this.touch();
  }

  step(s: DemoStep): void {
    this.steps.push(s);
    this.touch();
  }

  /** Extra run columns to write with the next flush. */
  set(patch: RunPatch): void {
    Object.assign(this.pending, patch);
    this.touch();
  }

  private touch(): void {
    this.dirty = true;
    if (!this.timer && this.store) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushMs);
    }
  }

  async flush(extra: RunPatch = {}): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    Object.assign(this.pending, extra);
    if (!this.store || (!this.dirty && Object.keys(this.pending).length === 0)) return;
    const patch: RunPatch = { ...this.pending, logs: this.redactedLogs(), timings: [...this.timings], steps: [...this.steps] };
    this.pending = {};
    this.dirty = false;
    const store = this.store;
    this.inflight = this.inflight.then(() => store.updateRun(this.runId, patch)).catch((err) => {
      console.warn(`[db] run update failed: ${err instanceof Error ? err.message : err}`);
    });
    await this.inflight;
  }
}

/** Measure an async stage in ms (float). */
export async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}
