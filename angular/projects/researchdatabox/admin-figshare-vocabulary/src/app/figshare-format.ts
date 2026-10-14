import { DateTime } from 'luxon';

/** Matches the display format used by the other admin screens (harvest runs, deleted records). */
export const FIGSHARE_DISPLAY_DATE_FORMAT = 'dd/MM/yyyy HH:mm';

/**
 * Render a stored ISO timestamp for display, falling back to the raw value when it cannot
 * be parsed so an unexpected format is still visible rather than silently blanked.
 */
export function formatFigshareTimestamp(value?: string | null): string {
  const safeValue = String(value ?? '').trim();
  if (!safeValue) {
    return '';
  }

  const date = DateTime.fromISO(safeValue);
  return date.isValid ? date.toFormat(FIGSHARE_DISPLAY_DATE_FORMAT) : safeValue;
}
