
/**
 * Main Process Logger
 * Simple console-based logger with level filtering for main process
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

export function createLogger(module: string) {
  return {
    debug(msg: string, ...args: unknown[]) { logIf('debug', module, msg, args); },
    info(msg: string, ...args: unknown[])  { logIf('info', module, msg, args); },
    warn(msg: string, ...args: unknown[])  { logIf('warn', module, msg, args); },
    error(msg: string, ...args: unknown[]) { logIf('error', module, msg, args); },
  };
}

function logIf(level: LogLevel, module: string, msg: string, args: unknown[]) {
  if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return;
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] [${level.toUpperCase()}] [${module}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, msg, ...args);
}
