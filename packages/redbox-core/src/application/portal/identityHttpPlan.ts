import { combineBrowserInput } from './pageHttpPlan';
import * as browserControllers from '../../http/controllers/BrowserControllers';
import type { BrowserPageBinding } from '../../http/controllers/BrowserControllers';
import type { PortalApplicationContext } from './application';
import { bindControllerFactory } from '../../http/controllers';
import * as c from '../../http/controllers/IdentityAdministrationControllers';
import { portalReadHttpInputs } from './readHttpPlan';
import type { BrandingDeliveryCache } from '../../http/brandingDeliveryCache';
/** Offline, concrete domain inputs shared with the preceding Express bindings. */
export function portalIdentityHttpInputs(portal: PortalApplicationContext, invalidateAssets: () => void) {
  const { data, config, log, providers } = portal;
  const users = {
    get users() {
      return data.users.get();
    },
    get roles() {
      return data.reference.roles.get();
    },
    hiddenRoles: config.auth.hiddenRoles,
    hiddenUsers: config.auth.hiddenUsers,
    log,
  };
  const administration = {
    get settings() {
      return data.reference.appConfigs.get();
    },
    get forwarding() {
      return providers.siem.get();
    },
    reloadTranslations: () => data.reference.translation.get().bootstrap(),
    invalidateAssets,
    audit: (
      actor: { id: string; username: string },
      action: string,
      context: { brandId: string; configKey?: string }
    ) => data.users.get().addUserAuditEvent({ ...actor }, action, context),
    log,
  };
  return { users, administration };
}
export function portalIdentityControllers(
  portal: PortalApplicationContext,
  selected: ReadonlySet<string>,
  cache: BrandingDeliveryCache,
  browser?: BrowserPageBinding
) {
  const inputs = portalIdentityHttpInputs(portal, () => cache.invalidate());
  const reads = portalReadHttpInputs(portal).queries;
  const siem: c.ApiSiemAdministrationControllerInput = {
    log: inputs.administration.log,
    audit: inputs.administration.audit,
    get settings() {
      return inputs.administration.settings;
    },
    get forwarding() {
      return inputs.administration.forwarding;
    },
    get siem() {
      return reads.siem;
    },
    siemConfig: reads.siemConfig,
  };
  const bindings = [
    bindControllerFactory(c.apiUserManagementController, inputs.users),
    browser
      ? bindControllerFactory(
          browserControllers.adminIdentityBrowserController,
          combineBrowserInput(inputs.users, browser)
        )
      : bindControllerFactory(c.adminIdentityController, inputs.users),
    bindControllerFactory(c.userIdentityController, inputs.users),
    bindControllerFactory(c.apiAdminOperationsController, inputs.administration),
    bindControllerFactory(c.apiSiemAdministrationController, siem),
  ].filter(binding => selected.has(binding.factory.name));
  return { controllers: bindings.map(binding => binding.factory), bindings };
}
