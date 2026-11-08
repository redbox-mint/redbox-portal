import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PoliciesConfig } from '../../config/policies.config';
import type { RecordMetadataInput } from '../../http/actions/recordMetadata';
import { portalHttpPolicies } from './httpPolicies';

/** The selected production domain slices consumed by metadata HTTP actions. */
export interface PortalMetadataContext {
  readonly log: ILogger;
  readonly config: { readonly server: { readonly rootContext: string } };
  readonly data: {
    readonly records: { get(): RecordMetadataInput['records'] };
    storage(): RecordMetadataInput['storage'];
    readonly reference: {
      readonly types: { get(): RecordMetadataInput['recordTypes'] };
      readonly workflows: { get(): RecordMetadataInput['workflows'] };
      readonly schema: { get(): RecordMetadataInput['schemas'] };
    };
  };
}
/** Shared offline selection for the production portal adapters. Read domain
 * ports lazily: the application, not the HTTP assembler, initializes services. */
export function portalHttpPlan(
  portal: PortalMetadataContext,
  options: { readonly policyConfiguration?: PoliciesConfig }
) {
  const metadata: RecordMetadataInput = {
    get records() {
      return portal.data.records.get();
    },
    get storage() {
      return portal.data.storage();
    },
    get recordTypes() {
      return portal.data.reference.types.get();
    },
    get workflows() {
      return portal.data.reference.workflows.get();
    },
    get schemas() {
      return portal.data.reference.schema.get();
    },
    rootContext: portal.config.server.rootContext,
    log: portal.log,
  };
  return { metadata, policyConfiguration: options.policyConfiguration ?? portalHttpPolicies() };
}

/** The same deployment selection feeds both production listeners. */
export function portalHostSettings(server: import('../../configuration/deployment').DeploymentConfiguration['server']) {
  const { hostname, port, trustProxy, stopDeadlineMs, rootContext } = server;
  return { hostname, port, trustProxy, stopDeadlineMs, rootContext };
}

/** Deployment settings shared by the two transport adapters; domain ports stay lazy. */
export function portalHttpSettings<Session>(
  config: {
    server: import('../../configuration/deployment').DeploymentConfiguration['server'];
    redboxSession: Session;
    auth: Pick<
      import('../../config/auth.config').AuthBootstrapConfig,
      'defaultBrand' | 'defaultPortal' | 'loginPath' | 'postLogoutRedir' | 'logoutOrigins'
    >;
  },
  options: { readonly portals?: readonly string[] }
) {
  return {
    host: portalHostSettings(config.server),
    session: config.redboxSession,
    origins: [new URL(config.server.publicUrl).origin],
    portals: options.portals ?? [config.auth.defaultPortal],
    login: {
      rootContext: config.server.rootContext,
      defaultBrand: config.auth.defaultBrand,
      defaultPortal: config.auth.defaultPortal,
      postLogoutPath: config.auth.postLogoutRedir,
      logoutOrigins: config.auth.logoutOrigins,
    },
    loginPath: config.auth.loginPath,
  };
}
