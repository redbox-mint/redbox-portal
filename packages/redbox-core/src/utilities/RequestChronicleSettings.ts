/**
 * Retention settings for request chronicle events.
 * Configured in `sails.config.log.requestChronicle`.
 */
export interface RequestChronicleSettings {
  /**
   * The fraction (0 to 1) of successful, fast requests to log.
   * Failed, aborted, and slow requests are always logged.
   * Set to 1, and `successSampleExcludePattern` to '', to log every request, e.g. while diagnosing an incident.
   */
  successSampleRate: number;
  /**
   * Requests that take longer than this many milliseconds are classified as slow and always logged.
   */
  slowThresholdMs: number;
  /**
   * Successful, fast requests with a path matching this regular expression (case-insensitive) are never sampled.
   * Defaults to static assets. Set to an empty string to sample all paths.
   */
  successSampleExcludePattern: string;
}

export const defaultRequestChronicleSettings: Readonly<RequestChronicleSettings> = Object.freeze({
  successSampleRate: 0.1,
  slowThresholdMs: 2000,
  successSampleExcludePattern: '\\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot)$',
});

/**
 * Resolve the request chronicle settings, using the defaults for missing or invalid values.
 * Values may be strings when set using environment variables.
 * @param settings The configured settings.
 */
export function resolveRequestChronicleSettings(
  settings?: Partial<Record<keyof RequestChronicleSettings, unknown>>
): RequestChronicleSettings {
  const toNumber = (value: unknown, defaultValue: number, min: number, max: number): number => {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      return defaultValue;
    }
    return Math.min(Math.max(parsed, min), max);
  };
  return {
    successSampleRate: toNumber(settings?.successSampleRate, defaultRequestChronicleSettings.successSampleRate, 0, 1),
    slowThresholdMs: toNumber(
      settings?.slowThresholdMs,
      defaultRequestChronicleSettings.slowThresholdMs,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    successSampleExcludePattern:
      typeof settings?.successSampleExcludePattern === 'string'
        ? settings.successSampleExcludePattern
        : defaultRequestChronicleSettings.successSampleExcludePattern,
  };
}
