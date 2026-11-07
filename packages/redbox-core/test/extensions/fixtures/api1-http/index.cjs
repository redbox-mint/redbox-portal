exports.registerRedboxExtension = () => ({
  apiVersion: 1,
  handlers: [
    {
      name: 'legacy',
      create: () => {
        throw new Error('Do not run API1 factories');
      },
    },
  ],
  routes: [{ name: 'legacy-route', method: 'get', path: '/legacy', handler: 'legacy', access: 'public' }],
  middleware: [{ name: 'legacy-after', stage: 'afterRoutes', handler: 'legacy' }],
  integrations: [
    {
      name: 'legacy-server',
      create: () => {
        throw new Error('Do not acquire a server');
      },
    },
  ],
});
