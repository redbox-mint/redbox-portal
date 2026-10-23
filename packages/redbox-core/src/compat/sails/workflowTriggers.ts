import { Services as Owned } from '../../records/WorkflowTriggers';
export class LegacyTrigger extends Owned.Trigger {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      get records() {
        return RecordsService;
      },
      get translation() {
        return TranslationService;
      },
      brand: id => BrandingService.getBrandById(id),
      resolveHook: name => eval(name),
    });
  }
  exports(): Record<string, unknown> {
    return Object.fromEntries(
      [
        'transitionWorkflow',
        'runHooksSync',
        'applyFieldLevelPermissions',
        'validateFieldUsingRegex',
        'validateFieldsUsingTemplate',
        'validateFieldMapUsingRegex',
        'runTemplatesOnRelatedRecord',
      ].map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing comparison workflow trigger: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}
