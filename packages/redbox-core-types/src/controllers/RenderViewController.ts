import { Controllers as controllers } from '../CoreController';

export namespace Controllers {

  export class RenderView extends controllers.Core.Controller {

    protected override _exportedMethods: any = [
      'render'
    ];

    /**
     * Renders the view that is passed to it (as a locals variable, usually from routes.js)
     *
     * @param req
     * @param res
     */
    public render(req: Sails.Req, res: Sails.Res) {
      const view = req.options.locals.view;
      if (view != null) {
        this.sendView(req, res, view);
      } else {
        res.notFound(req.options.locals, "404");
      }
    }
  }
}
