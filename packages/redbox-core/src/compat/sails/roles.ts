import { Services as Domain } from '../../identity/Roles';
import { getIdentityRepositories } from '../../persistence/identity/runtime';
export namespace Services {
  export class Roles extends Domain.Roles {
    public constructor() {
      super({
        get repository() {
          return getIdentityRepositories();
        },
        get log() {
          return sails.log;
        },
        auth: brand => ConfigService.getBrand(brand, 'auth') ?? {},
        roles: () => sails.config.auth.roles.map(role => ({ ...role })),
        defaultBrand: () => BrandingService.getDefault(),
        refreshBrand: id => BrandingService.refreshBrandingCache(id),
        loadBrands: () => BrandingService.loadAvailableBrands(undefined),
      });
    }
    protected _exportedMethods: string[] = [
      'bootstrap',
      'getRole',
      'getAdmin',
      'getAdminFromBrand',
      'getRoleIds',
      'getRolesWithBrand',
      'getAdminFromRoles',
      'getRoleWithName',
      'getRoleByName',
      'getDefAuthenticatedRole',
      'getDefUnathenticatedRole',
      'getNestedRoles',
      'createRoleWithBrand',
    ];

    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing comparison role operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/roles');
export function sailsRolesExports(): Record<string, unknown> {
  // Loader generation may inspect the surface before the global application exists.
  const methods = Object.keys(new Services.Roles().exports());
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.Roles | undefined;
        if (!instance) {
          instance = new Services.Roles();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
