import { defineRedboxHook } from '../../../packages/redbox-core/src/hooks';
import { Services as RecordsServiceNamespace } from '../../../packages/redbox-core/src/services/RecordsService';
import { Controllers as RecordControllerNamespace } from '../../../packages/redbox-core/src/controllers/RecordController';

class ExampleRecordsService extends RecordsServiceNamespace.Records {
  public constructor() {
    super();
    this._exportedMethods = [...this._exportedMethods, 'extensionHealth'];
  }

  public extensionHealth(): { ready: true } {
    return { ready: true };
  }
}

class ExampleRecordController extends RecordControllerNamespace.Record {
  public constructor() {
    super();
    this._exportedMethods = [...this._exportedMethods, 'extensionHealth'];
  }

  public extensionHealth(req: Sails.Req, res: Sails.Res) {
    return this.sendResp(req, res, { data: { ready: true } });
  }
}

export default defineRedboxHook({
  registerRedboxServices: () => ({ RecordsService: new ExampleRecordsService().exports() }),
  registerRedboxControllers: () => ({ RecordController: new ExampleRecordController().exports() }),
});
