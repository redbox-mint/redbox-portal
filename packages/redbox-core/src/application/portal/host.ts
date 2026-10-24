import { ExpressHost } from '../../http/express/ExpressHost';
import { createPortalApplication, type PortalApplicationOptions } from './application';
import { PortalHttp, type PortalHttpOptions } from './http';

/** One production runtime, listener and signal boundary. Construction performs no acquisition. */
export async function createPortalHost(options: PortalApplicationOptions & PortalHttpOptions) {
  let http: PortalHttp;
  const portal = await createPortalApplication({
    ...options,
    hostModules: [
      ...(options.hostModules ?? []),
      { name: 'portal-http', create: () => (http = new PortalHttp(portal, options)) },
    ],
  });
  const { config } = portal;
  const host = new ExpressHost(portal.application, {
    owner: portal.owner,
    port: config.server.port,
    hostname: config.server.hostname,
    rootContext: config.server.rootContext,
    trustProxy: config.server.trustProxy,
    stopDeadlineMs: config.server.stopDeadlineMs,
    prepare: (router, server) => http.prepare(router, server),
  });
  return { ...portal, host };
}
