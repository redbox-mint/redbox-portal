// Logger interface based on the custom logger in config/log.js
export interface ILogger {
  silly: (...args: any[]) => void;
  verbose: (...args: any[]) => void;
  trace: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  crit: (...args: any[]) => void;
  fatal: (...args: any[]) => void;
  silent: (...args: any[]) => void;
  blank: (...args: any[]) => void;
}
