import type { AgentKit } from "@coinbase/agentkit";

export async function invokeAction<T = unknown>(
  agentkit: AgentKit,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  // AgentKit prefixes action names with the provider class name
  // (e.g. `FloeActionProvider_request_credit`). Match either form.
  const actions = agentkit.getActions();
  const action =
    actions.find((a) => a.name === name) ??
    actions.find((a) => a.name.endsWith(`_${name}`));
  if (!action) throw new Error(`Action not found: ${name}`);
  const raw = await action.invoke(args);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export class Logger {
  private circuit: string;

  constructor(circuitName: string) {
    this.circuit = circuitName;
  }

  info(message: string, data?: any) {
    console.log(`[${this.circuit}] ℹ️  ${message}`, data || "");
  }

  success(message: string, data?: any) {
    console.log(`[${this.circuit}] ✅ ${message}`, data || "");
  }

  error(message: string, error?: any) {
    console.error(`[${this.circuit}] ❌ ${message}`, error || "");
  }

  warn(message: string, data?: any) {
    console.warn(`[${this.circuit}] ⚠️  ${message}`, data || "");
  }
}

export class Metrics {
  private startTime: number;
  private events: any[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  recordEvent(event: string, data: any) {
    this.events.push({
      timestamp: Date.now(),
      event,
      data,
    });
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  getSummary() {
    return {
      totalDuration: this.getElapsedTime(),
      events: this.events,
    };
  }

  async saveToFile(filename: string) {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filename, JSON.stringify(this.getSummary(), null, 2));
  }
}