const methods = [
  'bootstrap',
  'getForm',
  'flattenFields',
  'getFormByName',
  'filterFieldsHasEditAccess',
  'listForms',
  'inferSchemaFromMetadata',
  'generateFormFromSchema',
  'getFormByStartingWorkflowStep',
  'buildClientFormConfig',
  'extractRawTemplates',
  'buildContractFormConfig',
  'listConfiguredRecordContractForms',
  'discoverValidationOperations',
  'toPublicForm',
] as const;
import path from 'node:path';
import { Forms } from '../../forms/Forms';
import { getReferenceRepositories } from '../../persistence/runtime';
export class LegacyForms extends Forms {
  public constructor() {
    super({
      get repository() {
        return getReferenceRepositories();
      },
      get log() {
        return sails.log;
      },
      get config() {
        return sails.config;
      },
      get records() {
        return sails.services.recordsservice as unknown as import('../../RecordsService').RecordsService;
      },
      get validation() {
        return sails.services
          .recordvalidationservice as unknown as import('../../forms/Forms').FormsInput['validation'];
      },
      get recordTypes() {
        return RecordTypesService;
      },
      get workflowSteps() {
        return WorkflowStepsService;
      },
      vocabulary: {
        getEntries: (...args) => VocabularyService.getEntries(...args),
        defaultBrand: () => sails.config.auth?.defaultBrand ?? '',
      },
      defaultBrand: () => BrandingService.getDefault(),
      translate: (key, brand) =>
        typeof TranslationService === 'undefined' ? key : TranslationService.t(key, undefined, 'en', brand),
      formRegistry: () => {
        try {
          return (
            (require(path.join(sails.config.appPath, 'api/form-config')) as { forms?: Record<string, unknown> })
              .forms ?? {}
          );
        } catch (error) {
          sails.log.warn('Unable to load form-config registry', error instanceof Error ? error.message : String(error));
          return {};
        }
      },
    });
  }
  protected _exportedMethods: string[] = [...methods];

  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing forms comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/forms');
/** The comparison application owns its converted instance; shim generation is offline. */
export function sailsFormsExports(): Record<string, unknown> {
  const resolve = (): LegacyForms => {
    const app = sails;
    let instance = Reflect.get(app, instanceKey) as LegacyForms | undefined;
    if (!instance) {
      instance = new LegacyForms();
      Object.defineProperty(app, instanceKey, { value: instance });
    }
    return instance;
  };
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        const instance = resolve();
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
