import { listDatastreamsRoute, getDataStreamRoute } from '../api-routes/groups/records';
export const datastreamReadRoutes = [
  listDatastreamsRoute,
  getDataStreamRoute,
  ...['record', 'companion/record'].map(prefix => ({
    method: 'get' as const,
    path: '/:branding/:portal/' + prefix + '/:oid/attach/:attachId',
    controller: 'RecordController',
    action: 'doAttachment',
    headBehavior: 'fallthrough' as const,
  })),
  {
    method: 'get' as const,
    path: '/:branding/:portal/record/:oid/attachments',
    controller: 'RecordController',
    action: 'getAttachments',
  },
  {
    method: 'get' as const,
    path: '/:branding/:portal/record/:oid/datastream*',
    controller: 'RecordController',
    action: 'getDataStream',
  },
];
