const methods = ['resolve', 'resolveContractContext', 'discoverOperations'] as const;
import { firstValueFrom } from 'rxjs';
import { RecordValidation, type RecordValidationServiceDependencies } from '../../forms/RecordValidation';
import type { BrandingModel } from '../../model/storage/BrandingModel';
export class LegacyRecordValidation extends RecordValidation {
  public constructor(overrides?: Partial<RecordValidationServiceDependencies>) {
    super(
      {
        get log() {
          return sails.log;
        },
        get config() {
          return sails.config;
        },
        readers: {
          loadRecord: oid => RecordsService.getMeta(oid),
          loadRecordType: (brand, name) => firstValueFrom(RecordTypesService.get({ id: brand } as BrandingModel, name)),
          loadStartingWorkflowStep: async type =>
            (await firstValueFrom(WorkflowStepsService.getFirst(type))) as Awaited<
              ReturnType<RecordValidationServiceDependencies['loadStartingWorkflowStep']>
            >,
          loadWorkflowStep: async (type, step) =>
            (await firstValueFrom(WorkflowStepsService.get(type, step))) as Awaited<
              ReturnType<RecordValidationServiceDependencies['loadWorkflowStep']>
            >,
          loadWorkflowSteps: async type =>
            (await firstValueFrom(WorkflowStepsService.getAllForRecordType(type))) as Awaited<
              ReturnType<RecordValidationServiceDependencies['loadWorkflowSteps']>
            >,
          loadForm: (name, brand) => firstValueFrom(FormsService.getFormByName(name, true, brand)),
        },
        html: {
          sanitizeWithProfile: (value, profile) => DomSanitizerService.sanitizeWithProfile(value, profile),
          htmlSanitizationMode: () => sails.config.record?.form?.htmlSanitizationMode ?? 'sanitize',
        },
      },
      overrides
    );
  }
  public exports(): Record<string, unknown> {
    return {
      resolve: this.resolve.bind(this),
      resolveContractContext: this.resolveContractContext.bind(this),
      discoverOperations: this.discoverOperations.bind(this),
    };
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/recordValidation');
/** The comparison application owns its converted instance; shim generation is offline. */
export function sailsRecordValidationExports(): Record<string, unknown> {
  const resolve = (): LegacyRecordValidation => {
    const app = sails;
    let instance = Reflect.get(app, instanceKey) as LegacyRecordValidation | undefined;
    if (!instance) {
      instance = new LegacyRecordValidation();
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
