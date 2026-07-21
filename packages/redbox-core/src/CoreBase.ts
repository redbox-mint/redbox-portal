import {consoleLogger, ILogger, isAvailableLogLevel} from "@researchdatabox/sails-ng-common";

export abstract class CoreBase {
  /**
   * Exported methods. Must be overridden by the child to add custom methods.
   */
  protected _exportedMethods: string[] = [];

  private _logger?: ILogger = undefined;

  protected abstract _loggerNamespaceSuffix: string;

  constructor() {
    this.processDynamicImports().then(() => {
      this.logger.verbose("Dynamic imports imported");
      this.onDynamicImportsCompleted();
    });
  }

  /**
   * Function that allows async dynamic imports of modules (such as ECMAScript modules).
   * Called in the constructor and intended to be overridden in sub class to allow imports.
   */
  protected async processDynamicImports(): Promise<void> {
    // Override in sub class as needed
  }

  /**
   * Function that is called during the construction of the Controller after the dynamic imports are completed.
   * Intended to be overridden in the sub class
   */
  protected onDynamicImportsCompleted(): void {
    // Override in sub class as needed
  }

  /**
   * Registers a Sails hook handler if Sails is available.
   * @protected
   */
  protected registerSailsHook(action: 'on', eventName: string, handler: (...args: unknown[]) => void | Promise<void>): boolean;
  protected registerSailsHook(action: 'after', eventName: string | string[], handler: (...args: unknown[]) => void | Promise<void>): boolean;
  protected registerSailsHook(action: 'on' | 'after', eventName: string | string[], handler: (...args: unknown[]) => void | Promise<void>): boolean {
    if (sails === undefined) {
      this.logger.warn(`Sails is undefined so did not register hook action ${action} eventName ${eventName} handler ${handler}`);
      return false;
    }
    if (action === 'on') {
      if (typeof sails.on !== 'function') {
        this.logger.warn(`Sails.on is not a function so did not register hook action ${action} eventName ${eventName} handler ${handler}`);
        return false;
      }
      sails.on(eventName as string, handler);
      return true;
    }
    if (typeof sails.after !== 'function') {
      this.logger.warn(`Sails.after is not a function so did not register hook action ${action} eventName ${eventName} handler ${handler}`);
      return false;
    }
    sails.after(eventName, handler);
    return true;
  }

  /**
   * Get a namespaced logger for this class.
   * Uses the class constructor name as the namespace.
   * Falls back to sails.log if pino namespaced logging is not available.
   * @protected
   */
  protected get logger(): ILogger {
    // Preference order: this._logger; create pino namespace logger; use sails.log; use console temporarily

    if (this._logger !== undefined) {
      return this._logger;
    }

    if (
      sails?.config?.log !== undefined &&
      'createNamespaceLogger' in sails?.config?.log &&
      typeof sails.config.log.createNamespaceLogger === 'function' &&
      'customLogger' in sails?.config?.log &&
      typeof sails.config.log.customLogger === 'function'
    ) {
      const serviceName = this.constructor.name + this._loggerNamespaceSuffix;
      this._logger = sails.config.log.createNamespaceLogger(serviceName, sails.config.log.customLogger);
      return this._logger;
    }

    if (sails?.log !== undefined) {
      this._logger = sails.log;
      return this._logger;
    }

    // Fallback logger for when sails is not defined (e.g. during shim generation).
    // This should be temporary as the app loads, until `sails.log` is available, so don't assign to `this._logger`.
    return consoleLogger;
  }

  /**
   * Log at a particular level.
   * This allows specifying the level in config so it can be changed.
   * @param level Log level.
   * @param args Log message.
   * @protected
   */
  protected logAtLevel(level: string, ...args: unknown[]): void {
    const log = this.logger;
    if (!isAvailableLogLevel(level)) {
      log.warn(`Unknown log level '${level}' in logAtLevel, using 'info' instead.`);
      level = 'info';
    }

    if (isAvailableLogLevel(level)) {
      if (level in log && typeof log[level] === 'function') {
        log[level](...args);
      }
    }
  }
}
