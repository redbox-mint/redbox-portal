import {
  AuthenticationAccounts,
  type AuthBrandConfig,
  type AuthenticationAccountsInput,
} from '../../authentication/Accounts';
import { HttpIdentity } from '../../http/express/identity';
import { getIdentityRepositories } from '../../persistence/identity/runtime';
import type { IdentityProvidersInput } from '../../http/express/identityProviders';
import type { RoleModel } from '../../model/storage/RoleModel';

const key = Symbol.for('@researchdatabox/redbox-core/comparison/AuthenticationAccounts');
export function sailsAuthenticationAccounts(event: AuthenticationAccountsInput['event']): AuthenticationAccounts {
  let instance = Reflect.get(sails, key) as AuthenticationAccounts | undefined;
  if (!instance) {
    instance = new AuthenticationAccounts({
      get repository() {
        return getIdentityRepositories();
      },
      get log() {
        return sails.log;
      },
      get postLogoutRedirect() {
        return sails.config.auth.postLogoutRedir;
      },
      defaultBrand: () => BrandingService.getDefault(),
      getBrand: name => BrandingService.getBrand(name),
      authConfig: name => (ConfigService.getBrand(name, 'auth') ?? {}) as AuthBrandConfig,
      defaultAuthenticatedRole: brand => RolesService.getDefAuthenticatedRole(brand),
      nestedRoles: (name, roles) =>
        RolesService.getNestedRoles(name, roles).filter((role): role is RoleModel => role !== undefined),
      authorizedEmails: brand => sails.config.brandingAware(brand).authorizedDomainsEmails ?? {},
      resolveHook: name => eval(name),
      event,
    });
    Object.defineProperty(sails, key, { value: instance });
  }
  return instance;
}
export function sailsAuthenticationProviders(accounts: AuthenticationAccounts): IdentityProvidersInput {
  return {
    passport: sails.config.passport as unknown as IdentityProvidersInput['passport'],
    accounts,
    config: (ConfigService.getBrand(BrandingService.getDefault().name, 'auth') ?? {}) as AuthBrandConfig,
    brand: req => BrandingService.getBrand(String(req.session.branding ?? BrandingService.getDefault().name)),
  };
}

export function sailsHttpIdentity(): HttpIdentity {
  return new HttpIdentity(getIdentityRepositories());
}
