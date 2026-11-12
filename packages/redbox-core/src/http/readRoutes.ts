import { recordApiRoutes } from '../api-routes/groups/records';
import { exportApiRoutes } from '../api-routes/groups/export';
import { recordSchemaApiRoutes } from '../api-routes/groups/record-schemas';
import { reportsApiRoutes, executeNamedQueryRoute } from '../api-routes/groups/reports';
import { namedQueryApiRoutes } from '../api-routes/groups/named-query';
import { harvestRunApiRoutes } from '../api-routes/groups/harvest-runs';
import { siemApiRoutes } from '../api-routes/groups/siem';
import { searchRecordsRoute } from '../api-routes/groups/search';
import { integrationAuditApiRoutes } from '../api-routes/groups/integration-audit';
export const recordSchemaReadRoutes = recordSchemaApiRoutes;
const apiReads = recordApiRoutes.filter(route =>
  [
    'listRecords',
    'listDeletedRecords',
    'getDeletedRecord',
    'getMeta',
    'getObjectMeta',
    'getPermissions',
    'getRecordAudit',
  ].includes(route.action)
);
// Literal lists precede object identifiers, as in the accepted route inventory.
apiReads.sort((a, b) => Number(!a.path.endsWith('/list')) - Number(!b.path.endsWith('/list')));
const browserReads = [
  ['/listRecords', 'getRecordList'],
  ['/listDeletedRecords', 'getDeletedRecordList'],
  ['/record/metadata/:oid', 'getMeta'],
  ['/record/default/:name', 'getMetaDefault'],
  ['/record/delete/:oid', 'getDeletedRecord'],
  ['/record/:oid/permissions', 'getPermissions'],
  ['/record/:oid/relatedRecords', 'getRelatedRecords'],
  ['/record/search/:type', 'search'],
].map(([path, action]) => ({
  method: 'get' as const,
  path: '/:branding/:portal' + path,
  controller: 'RecordController',
  action,
}));
const exportReads = [
  ...exportApiRoutes,
  ...exportApiRoutes.map(r => ({ ...r, path: r.path.replace('/api/', '/'), controller: 'ExportController' })),
];
export const recordReadRoutes = [
  ...apiReads,
  ...browserReads,
  ...exportReads,
  ...recordSchemaReadRoutes,
  {
    method: 'all' as const,
    path: '/:branding/:portal/workspaces/list',
    controller: 'RecordController',
    action: 'listWorkspaces',
  },
];
const reportReads = reportsApiRoutes.filter(
  r => r.action !== 'executeNamedQuery' && (r.method === 'get' || r.action === 'previewConfig')
);
export const queryReadRoutes = [
  executeNamedQueryRoute,
  ...reportReads,
  ...reportReads.map(r => ({ ...r, path: r.path.replace('/api/', '/admin/'), controller: 'ReportController' })),
  ...namedQueryApiRoutes.filter(r => r.method === 'get'),
  ...harvestRunApiRoutes,
  ...siemApiRoutes.filter(r => r.method === 'get'),
  searchRecordsRoute,
  ...integrationAuditApiRoutes,
  ...[
    ['/admin/getReport', 'ReportController', 'get'],
    ['/admin/getReportResults', 'ReportController', 'getResults'],
    ['/admin/downloadReportCSV', 'ReportController', 'downloadCSV'],
    ['/record/viewAudit/:oid/audit', 'RecordAuditController', 'audit'],
    ['/record/viewAudit/:oid/permissions', 'RecordAuditController', 'permissions'],
    ['/record/viewAudit/:oid/integration-audit', 'RecordAuditController', 'integrationAudit'],
    ['/record/integrationStatus/:oid', 'RecordAuditController', 'integrationStatus'],
  ].map(([path, controller, action]) => ({
    method: 'get' as const,
    path: '/:branding/:portal' + path,
    controller,
    action:
      (
        {
          audit: 'getAuditData',
          permissions: 'getPermissionsData',
          integrationAudit: 'getIntegrationAuditData',
          integrationStatus: 'getIntegrationStatusData',
        } as Record<string, string>
      )[action] ?? action,
  })),
];

/** FM-024 selection; the FM-019 metadata GET keeps its existing action. */
export const recordQueryReadDeclarations = [...queryReadRoutes, ...recordReadRoutes].filter(
  route => !(route.controller === 'webservice/RecordController' && route.action === 'getMeta')
);
