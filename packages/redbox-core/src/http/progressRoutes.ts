export const progressOperationRoutes = [
  ...(['post', 'put', 'delete', 'get'] as const).map((method, index) => ({
    method,
    path: '/:branding/:portal/asynch',
    controller: 'AsynchController',
    action: ['start', 'update', 'stop', 'progress'][index]!,
  })),
  {
    method: 'get' as const,
    path: '/:branding/:portal/asynch/subscribe/:roomId',
    controller: 'AsynchController',
    action: 'subscribe',
  },
  {
    method: 'delete' as const,
    path: '/:branding/:portal/asynch/subscribe/:roomId',
    controller: 'AsynchController',
    action: 'unsubscribe',
  },
];
export const progressSocketGrantRoute = {
  method: 'post' as const,
  path: '/:branding/:portal/asynch/socket-token',
  controller: 'AsynchController',
  action: 'subscribe',
};
