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

export const consoleLogger: ILogger = {
  silly: (...args: unknown[]): void => console.log(...args),
  verbose: (...args: unknown[]): void => console.log(...args),
  trace: (...args: unknown[]): void => console.trace(...args),
  debug: (...args: unknown[]): void => console.debug(...args),
  log: (...args: unknown[]): void => console.log(...args),
  info: (...args: unknown[]): void => console.info(...args),
  warn: (...args: unknown[]): void => console.warn(...args),
  error: (...args: unknown[]): void => console.error(...args),
  crit: (...args: unknown[]): void => console.error(...args),
  fatal: (...args: unknown[]): void => console.error(...args),
  silent: (): void => undefined,
  blank: (): void => console.log(''),
};
