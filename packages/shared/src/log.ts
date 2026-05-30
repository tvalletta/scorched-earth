export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEvent { t: number; level: LogLevel; scope: string; msg: string; data?: unknown; }

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class RingBuffer {
  private buf: LogEvent[] = [];
  constructor(private capacity = 300) {}
  push(e: LogEvent): void {
    this.buf.push(e);
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
  }
  snapshot(): LogEvent[] { return this.buf.slice(); }
  clear(): void { this.buf = []; }
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(scope: string): Logger;
}

export interface LoggerOpts { level?: LogLevel; ring?: RingBuffer; }

export function createLogger(scope: string, opts: LoggerOpts = {}): Logger {
  const threshold = ORDER[opts.level ?? "info"];
  const emit = (level: LogLevel, msg: string, data?: unknown) => {
    if (ORDER[level] < threshold) return;
    const e: LogEvent = { t: Date.now(), level, scope, msg, data };
    opts.ring?.push(e);
    const line = `[${scope}] ${msg}`;
    if (data !== undefined) console[level](line, data); else console[level](line);
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
    child: (s) => createLogger(`${scope}:${s}`, opts),
  };
}
