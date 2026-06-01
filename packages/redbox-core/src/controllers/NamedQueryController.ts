import { Controllers as controllers } from '../CoreController';

export namespace Controllers {
  export class NamedQuery extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'editor'
    ];

    public async editor(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/named-query');
    }
  }
}
