// Logger interface based on the custom logger in config/log.js
export interface ILogger {
  level?: string;
  silly: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  crit: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  silent: (...args: unknown[]) => void;
  blank: (...args: unknown[]) => void;
}
