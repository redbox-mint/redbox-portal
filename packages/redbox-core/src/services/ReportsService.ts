import { LegacyReports } from '../compat/sails/reports';
export * from '../queries/Reports';
export namespace Services {
  export class Reports extends LegacyReports {}
}
declare global {
  let ReportsService: Services.Reports;
}
