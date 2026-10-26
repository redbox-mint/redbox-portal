import { consoleLogger, type ILogger, logAtLevel } from '@researchdatabox/sails-ng-common';
export abstract class CoreBase {
  protected _exportedMethods: string[] = [];
  protected abstract _loggerNamespaceSuffix: string;
  constructor(protected readonly logger: ILogger = consoleLogger) {}
  protected logAtLevel(level: string, ...args: unknown[]): void {
    logAtLevel(this.logger, level, ...args);
  }
}
