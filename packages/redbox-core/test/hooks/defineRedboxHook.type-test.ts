import { defineRedboxHook, type HookRegistrationMap } from '../../dist/hooks/defineRedboxHook';

interface LegacyHookExports extends HookRegistrationMap {
  readonly FormConfigExports: {
    readonly defaultForm: string;
  };
  readonly describeHook: () => string;
}

const additionalExports: LegacyHookExports = {
  FormConfigExports: { defaultForm: 'data-management-plan' },
  describeHook: (): string => 'legacy-compatible',
};

const hook = defineRedboxHook({ additionalExports });

const formName: string = hook.FormConfigExports.defaultForm;
const description: string = hook.describeHook();
const callableHook: (sails: Sails.Application) => object = hook;

export const defineRedboxHookCompatibility = {
  callableHook,
  description,
  formName,
};
