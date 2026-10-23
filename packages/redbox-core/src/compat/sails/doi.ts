import { Services as Owned } from '../../integrations/Doi';
import * as runtime from '../../services/doi-v2/runtime';
import * as config from '../../services/doi-v2/config';
import * as audit from '../../services/doi-v2/audit';

export class LegacyDoi extends Owned.Doi {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      translate: key => TranslationService.t(key),
      configuration: {
        record: record => config.resolveDoiPublishingConfig(record),
        brand: brand => config.resolveDoiPublishingConfigForBrand(brand),
      },
      audit: {
        start: (...args) => audit.startDoiAudit(...args),
        complete: (...args) => audit.completeDoiAudit(...args),
        fail: (...args) => audit.failDoiAudit(...args),
      },
      records: { updateMetaInternal: input => RecordsService.updateMetaInternal(input) },
      programs: {
        create: (...args) => runtime.runCreateDoiProgram(...args),
        update: (...args) => runtime.runUpdateDoiProgram(...args),
        delete: (...args) => runtime.runDeleteDoiProgram(...args),
        changeState: (...args) => runtime.runChangeDoiStateProgram(...args),
      },
    });
  }
  public init(): void {}
  exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing DOI comparison method.');
        return [name, method.bind(this)];
      })
    );
  }
}
