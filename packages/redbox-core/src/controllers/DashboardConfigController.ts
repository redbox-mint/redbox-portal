import { Controllers as webserviceControllers } from './webservice/DashboardConfigController';

export namespace Controllers {
  /**
   * Admin editor host plus CSRF-protected session routes for the editor. The
   * operations are the same as the REST API and delegate to the same service.
   */
  export class DashboardConfig extends webserviceControllers.DashboardConfig {
    protected override _exportedMethods: string[] = [
      'editor',
      'listTargets',
      'getWorkflowTarget',
      'saveWorkflowTarget',
      'getViewTarget',
      'saveViewTarget',
      'validateSettings',
      'previewCopy',
      'applyCopy',
      'getWorkflowFields',
      'getViewFields'
    ];

    public async editor(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/dashboard-config');
    }
  }
}
