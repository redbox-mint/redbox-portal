import type { Request, Response } from 'express';
import { Services as Dashboard } from '../../dashboards/DashboardConfig';
import { apiNoCacheHeaders, validationApiVersion } from './responses';

export function retiredDashboardOperation(): never {
  throw new Dashboard.DashboardConfigError(
    'legacy-operation-retired',
    'This dashboard configuration operation has been retired. Dashboard profiles, defaults and overrides were replaced by independent settings for each workflow stage and dashboard-view step. Use GET /api/dashboard-config/targets, GET|PUT /api/dashboard-config/workflows/:recordType/:stage, GET|PUT /api/dashboard-config/views/:view/:step and the /api/dashboard-config/copy operations.',
    { replacement: '/api/dashboard-config/targets' }
  );
}
export function sendDashboardError(req: Request, res: Response, error: unknown): void {
  if (!(error instanceof Dashboard.DashboardConfigError)) throw error;
  res
    .set(apiNoCacheHeaders)
    .status(error.status)
    .json(
      validationApiVersion(req) === '2.0'
        ? {
            errors: [
              {
                status: String(error.status),
                code: error.code,
                title: error.code,
                detail: error.message,
                meta: error.details,
              },
            ],
            meta: error.details,
          }
        : { message: error.code, details: error.message }
    );
}
