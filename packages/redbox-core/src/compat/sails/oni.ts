import { firstValueFrom } from 'rxjs';
import { Services as Owned } from '../../integrations/Oni';
import * as config from '../../services/oni-v2/config';
import * as repository from '../../services/oni-v2/repository';
import * as runtime from '../../services/oni-v2/runtime';
import { makeOniAuditService } from '../../integrations/oni/audit';
import type { DatastreamService } from '../../DatastreamService';

export class LegacyOni extends Owned.OniService {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      configuration: record => config.resolveOniPublishingConfig(record),
      brand: record => config.getBrand(record),
      brandName: record => config.getBrandName(record),
      creator: name => firstValueFrom(UsersService.getUserWithUsername(name)),
      records: { updateMetaInternal: input => RecordsService.updateMetaInternal(input) },
      get audit() {
        return makeOniAuditService(
          typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService
        );
      },
      createRepository: (config, site) => {
        const name = sails.config.record.datastreamService;
        const service = name ? (sails.services[name] as unknown as DatastreamService) : undefined;
        if (!service || typeof service.getDatastream !== 'function')
          throw new Error('Datastream service is not configured for Oni publishing');
        return repository.createOniRepository(config, site, service);
      },
      publish: (...args) => runtime.runPublishDatasetProgram(...args),
      runWork: operation => operation(),
    });
  }
  exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing Oni comparison method.');
        return [name, method.bind(this)];
      })
    );
  }
}
