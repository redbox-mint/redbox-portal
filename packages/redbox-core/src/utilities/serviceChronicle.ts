import type { ILogger } from '@researchdatabox/sails-ng-common';
import { currentRequestChronicle } from './RequestChronicleContext';
import { sanitizeChronicleValue, toChronicleError, toChronicleLogRecord } from './RequestChronicle';
export function recordServiceChronicle(
  log: ILogger,
  info: Record<string, unknown>,
  errors: unknown[] = [],
  level: 'debug' | 'info' | 'warn' = 'debug'
): void {
  const helper = currentRequestChronicle();
  let safeInfo: unknown;
  try {
    if (helper !== undefined) {
      if (helper.isRunning || errors.length === 0) {
        helper.addInfo(info, level);
      }
    } else {
      safeInfo = sanitizeChronicleValue(info);
      if (errors.length === 0 && Object.keys(info).length > 0) {
        log[level](toChronicleLogRecord({ info: safeInfo }), 'Service operation');
      }
    }
  } catch {
    // Observability must never change the result of a service operation.
  }
  for (const error of errors) {
    try {
      if (helper !== undefined) {
        helper.addError(error, helper.isRunning ? undefined : info);
      } else {
        log.error(
          toChronicleLogRecord({
            ...(safeInfo !== undefined ? { info: safeInfo } : {}),
            error: toChronicleError(error),
          }),
          'Service operation failed.'
        );
      }
    } catch {
      // A failed details transport must not suppress error capture.
    }
  }
}
