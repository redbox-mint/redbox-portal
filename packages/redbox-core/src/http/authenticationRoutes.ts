export const authenticationRoutes = (
  [
    ['post', '/user/login_local', 'localLogin'],
    ['post', '/user/login_aaf', 'aafLogin'],
    ['get', '/user/login_oidc', 'openidConnectLogin'],
    ['get', '/user/begin_oidc', 'beginOidc'],
    ['head', '/user/begin_oidc', 'disallowedHeadRequestHandler'],
    ['get', '/user/info', 'info'],
    ['get', '/:branding/:portal/user/info', 'info'],
    ['post', '/:branding/:portal/user/logout', 'logout'],
    ['get', '/:branding/:portal/user/logout', 'logout'],
  ] as const
).map(([method, path, action]) => ({ method, path, action, controller: 'UserController' }));
