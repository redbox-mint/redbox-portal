import * as Logger from 'effect/Logger';
import * as References from 'effect/References';

export interface RaidLogSink { debug(message: unknown): void; info(message: unknown): void; warn(message: unknown): void; error(message: unknown): void }

function sanitize(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = /authorization|token|password|secret/i.test(key) ? '[REDACTED]' : sanitize(item);
  }
  return output;
}

export function makeLoggerLayer(sink: RaidLogSink) {
  const logger = Logger.make(({ logLevel, message, fiber }) => {
    const entry = sanitize({ message, ...fiber.getRef(References.CurrentLogAnnotations) });
    if (logLevel === 'Error' || logLevel === 'Fatal') sink.error(entry);
    else if (logLevel === 'Warn') sink.warn(entry);
    else if (logLevel === 'Debug' || logLevel === 'Trace') sink.debug(entry);
    else sink.info(entry);
  });
  return Logger.layer([logger, Logger.tracerLogger]);
}
