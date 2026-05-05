import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface PerfLogEvent {
  name: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  source?: 'renderer' | 'main';
}

export interface PerfLogInfo {
  enabled: boolean;
  logPath?: string;
  sessionId?: string;
}

const perfEnabled = process.env.KPM_PERF === '1' || process.env.KPM_PERF === 'true';

let perfLogger: PerfLogger | null = null;

class PerfLogger {
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  readonly sessionId: string;
  readonly logPath: string;

  constructor() {
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = app.getPath('temp');
    this.logPath = path.join(tempDir, `kpm-perf-${this.sessionId}.ndjson`);
    this.initFile();
  }

  private initFile(): void {
    if (this.initialized) return;
    this.initialized = true;

    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.enqueueLine({
      type: 'session_start',
      sessionId: this.sessionId,
      ts: Date.now(),
      appVersion: app.getVersion(),
      platform: process.platform,
    });

    console.log(`[Perf] Logging performance data to ${this.logPath}`);
  }

  private enqueueLine(entry: Record<string, unknown>): void {
    const line = `${JSON.stringify(entry)}\n`;
    this.writeChain = this.writeChain
      .then(() => fs.promises.appendFile(this.logPath, line))
      .catch((error) => {
        console.error('[Perf] Failed to write perf log:', error);
      });
  }

  log(event: PerfLogEvent): void {
    this.initFile();
    this.enqueueLine({
      type: 'event',
      sessionId: this.sessionId,
      ts: Date.now(),
      ...event,
    });
  }

  getInfo(): { logPath: string; sessionId: string } {
    this.initFile();
    return {
      logPath: this.logPath,
      sessionId: this.sessionId,
    };
  }
}

export function isPerfEnabled(): boolean {
  return perfEnabled;
}

export function getPerfLogger(): PerfLogger | null {
  if (!perfEnabled) return null;
  if (!perfLogger) {
    perfLogger = new PerfLogger();
  }
  return perfLogger;
}

export function getPerfLogInfo(): PerfLogInfo {
  if (!perfEnabled) {
    return { enabled: false };
  }

  const logger = getPerfLogger();
  if (!logger) {
    return { enabled: false };
  }

  const info = logger.getInfo();
  return {
    enabled: true,
    logPath: info.logPath,
    sessionId: info.sessionId,
  };
}
