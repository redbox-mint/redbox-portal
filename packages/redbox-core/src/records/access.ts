import _ from 'lodash';
import type { BrandingModel } from '../model/storage/BrandingModel';
type AnyRecord = Record<string, unknown>;
export type RecordRoleLookup = (brand: BrandingModel, name: string) => { id?: string | number } | null | undefined;
const brandRole: RecordRoleLookup = (brand, name) => brand.roles?.find(role => role.name == name);
function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
}
export function hasViewAccess(
  brand: unknown,
  user: AnyRecord,
  roles: object[],
  record: AnyRecord,
  getRole: RecordRoleLookup = brandRole
): boolean {
  const auth = record.authorization as AnyRecord | undefined;
  const editArr = auth ? auth.edit : record.authorization_edit;
  const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
  const viewArr = auth ? auth.view : record.authorization_view;
  const viewRolesArr = auth ? auth.viewRoles : record.authorization_viewRoles;
  const uname = String(user.username ?? '');
  const brandObj = brand as BrandingModel;

  const combinedViewArr = _.union(asArray(viewArr) ?? [], asArray(editArr) ?? []);
  const combinedViewRolesArr = _.union(asArray(viewRolesArr) ?? [], asArray(editRolesArr) ?? []);

  const isInUserView = _.find(combinedViewArr, (username: unknown) => {
    return uname == username;
  });
  if (!_.isUndefined(isInUserView)) {
    return true;
  }
  const isInRoleView = _.find(combinedViewRolesArr, (roleName: unknown) => {
    const role = getRole(brandObj, String(roleName));
    return (
      role &&
      !_.isUndefined(
        _.find(roles, (r: AnyRecord) => {
          return role.id == r.id;
        })
      )
    );
  });
  return !_.isUndefined(isInRoleView);
}

export function hasEditAccess(
  brand: unknown,
  user: AnyRecord,
  roles: AnyRecord[],
  record: AnyRecord,
  getRole: RecordRoleLookup = brandRole
): boolean {
  const auth = record.authorization as AnyRecord | undefined;
  const editArr = auth ? auth.edit : record.authorization_edit;
  const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
  const uname = String(user.username ?? '');
  const brandObj = brand as BrandingModel;

  const isInUserEdit = _.find(asArray(editArr), (username: unknown) => {
    return uname == username;
  });
  if (!_.isUndefined(isInUserEdit)) {
    return true;
  }
  const isInRoleEdit = _.find(asArray(editRolesArr), (roleName: unknown) => {
    const role = getRole(brandObj, String(roleName));
    return (
      role &&
      !_.isUndefined(
        _.find(roles, (r: AnyRecord) => {
          return role.id == r.id;
        })
      )
    );
  });
  return !_.isUndefined(isInRoleEdit);
}

export function hasTransitionRoleAuthorization(step: unknown, user: AnyRecord | null | undefined): boolean {
  const configured = _.get(step, 'config.authorization.transitionRoles') as unknown;
  if (!Array.isArray(configured) || configured.length === 0) return true;
  const actorRoles = Array.isArray(user?.roles) ? user.roles : [];
  // Compatibility: historically a configured string matched either a
  // string actor role or an actor role object's name. Configured role
  // objects only matched by identity; matching two objects by `.name`
  // would silently broaden transition authorization.
  return configured.some(configuredRole =>
    actorRoles.some(
      actorRole =>
        configuredRole === actorRole ||
        (!!actorRole && typeof actorRole === 'object' && configuredRole === (actorRole as AnyRecord).name)
    )
  );
}
