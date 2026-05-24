
/**
 * Logger - Unified logging system
 * Supports levels: debug, info, warn, error
 * Writes to console + persists to localStorage ring buffer
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  module: string;
  message: string;
  stack?: string;
}

const LOG_BUFFER_SIZE = 200;
const LOG_KEY = 'app-logs';

class Logger {
  private module: string;
  private buffer: LogEntry[] = [];

  constructor(module: string) {
    this.module = module;
    this.loadBuffer();
  }

  private loadBuffer(): void {
    try {
      const saved = localStorage.getItem(LOG_KEY);
      if (saved) this.buffer = JSON.parse(saved);
    } catch { /* ignore */ }
  }

  private saveBuffer(): void {
    if (this.buffer.length > LOG_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-LOG_BUFFER_SIZE);
    }
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(this.buffer));
    } catch { /* storage full */ }
  }

  private log(level: LogLevel, message: string, err?: unknown): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module: this.module,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    };
    this.buffer.push(entry);
    this.saveBuffer();

    const prefix = `[${entry.ts.slice(11, 19)}] [${level.toUpperCase()}] [${this.module}]`;
    const fullMsg = err instanceof Error ? `${message}: ${err.message}` : message;

    switch (level) {
      case 'debug': console.debug(prefix, fullMsg); break;
      case 'info':  console.info(prefix, fullMsg); break;
      case 'warn':  console.warn(prefix, fullMsg); break;
      case 'error': console.error(prefix, fullMsg, err instanceof Error ? err.stack : ''); break;
    }
  }

  debug(msg: string): void { this.log('debug', msg); }
  info(msg: string): void { this.log('info', msg); }
  warn(msg: string): void { this.log('warn', msg); }
  error(msg: string, err?: unknown): void { this.log('error', msg, err); }

  getRecent(n: number = 50): LogEntry[] {
    return this.buffer.slice(-n);
  }

  clear(): void {
    this.buffer = [];
    localStorage.removeItem(LOG_KEY);
  }

  static dumpToConsole(): void {
    try {
      const saved = localStorage.getItem(LOG_KEY);
      if (saved) {
        console.group('App Logs');
        (JSON.parse(saved) as LogEntry[]).forEach(e => {
          const style = e.level === 'error' ? 'color:red' : e.level === 'warn' ? 'color:orange' : '';
          console.log(`%c[${e.ts.slice(11,19)}] [${e.level.toUpperCase()}] [${e.module}] ${e.message}`, style);
          if (e.stack) console.log(e.stack);
        });
        console.groupEnd();
      }
    } catch { /* ignore */ }
  }
}

// Make logger available globally for debugging
(window as any).__logger = {
  create: (m: string) => new Logger(m),
  dump: () => Logger.dumpToConsole(),
};

export { Logger };
