import { LegacyWorkspaceTypes } from '../compat/sails/workspaceTypes';
export namespace Services {
  export class WorkspaceTypes extends LegacyWorkspaceTypes {}
}
declare global {
  let WorkspaceTypesService: Services.WorkspaceTypes;
}
