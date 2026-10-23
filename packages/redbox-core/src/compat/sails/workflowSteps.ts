import { Services as Domain } from '../../workflows/WorkflowSteps';
import { getReferenceRepositories } from '../../persistence/runtime';

const methods = [
  'bootstrap',
  'create',
  'get',
  'getFirst',
  'getAllForRecordType',
  'getAllForRecordTypeIncludingHidden',
] as const;

export class LegacyWorkflowSteps extends Domain.WorkflowSteps {
  public constructor() {
    super({
      get references() {
        return getReferenceRepositories();
      },
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
      initialiseDashboardSettings: async type => {
        const branding = type.branding;
        const id = typeof branding === 'object' ? branding?.id : branding;
        if (id && typeof DashboardConfigService !== 'undefined' && DashboardConfigService.isReady?.()) {
          await DashboardConfigService.initialiseMissingTargets(BrandingService.getBrandById(String(id)));
        }
      },
    });
  }
  protected _exportedMethods: string[] = [...methods];
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing WorkflowSteps comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/WorkflowSteps');
export function sailsWorkflowStepsExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyWorkflowSteps | undefined;
        if (!instance) {
          instance = new LegacyWorkflowSteps();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
