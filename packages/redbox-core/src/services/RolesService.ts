import { Services as Comparison } from '../compat/sails/roles';
export namespace Services {
  export class Roles extends Comparison.Roles {}
}
declare global {
  let RolesService: Services.Roles;
}
