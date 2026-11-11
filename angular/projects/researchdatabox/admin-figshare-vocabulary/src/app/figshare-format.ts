import { ADMIN_DATE_TIME_FORMAT, formatAdminDate } from '@researchdatabox/portal-ng-common';

export const FIGSHARE_DISPLAY_DATE_FORMAT = ADMIN_DATE_TIME_FORMAT;

export function formatFigshareTimestamp(value?: string | null): string {
  return formatAdminDate(value);
}
