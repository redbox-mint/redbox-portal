import { z } from 'zod';
import type { ReportingLimits } from '../reporting/types';
export interface ReportingConfig {
  enabled: boolean;
  limits: ReportingLimits;
}
export const reporting: ReportingConfig = {
  enabled: false,
  limits: {
    maxPageSize: 100,
    maxGroups: 100,
    maxOffset: 10_000,
    maxFilters: 20,
    maxGroupDimensions: 3,
    maxDateRangeDays: 3660,
    aggregationTimeoutMs: 5000,
    maxSearchResults: 50,
    maxOutputBytes: 64_000,
  },
};
export const reportingLimitsSchema = z.strictObject({
  maxPageSize: z.number().int().min(1).max(100),
  maxGroups: z.number().int().min(1).max(100),
  maxOffset: z.number().int().min(0).max(10_000),
  maxFilters: z.number().int().min(0).max(20),
  maxGroupDimensions: z.number().int().min(1).max(3),
  maxDateRangeDays: z.number().int().min(1).max(3660),
  aggregationTimeoutMs: z.number().int().min(1).max(30_000),
  maxSearchResults: z.number().int().min(1).max(100),
  maxOutputBytes: z.number().int().min(1024).max(1_000_000),
});
