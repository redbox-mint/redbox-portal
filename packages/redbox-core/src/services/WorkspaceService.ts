export { Services } from '../compat/sails/workspaces';
import type { Services } from '../compat/sails/workspaces';
declare global {
  let WorkspaceService: Services.WorkspaceService;
}
