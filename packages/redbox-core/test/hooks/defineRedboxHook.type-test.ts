import { defineRedboxHook, type DefinedRedboxHook, type HookRegistrationMap } from '../../dist';

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

export const explicitlyTypedHook = defineRedboxHook<LegacyHookExports>({ additionalExports });
export const inferredHook = defineRedboxHook({
  additionalExports: {
    FormConfigExports: { defaultForm: 'data-publication' },
    describeHook: (): string => 'inferred',
  },
});

const explicitFormName: string = explicitlyTypedHook.FormConfigExports.defaultForm;
const explicitDescription: string = explicitlyTypedHook.describeHook();
const inferredFormName: string = inferredHook.FormConfigExports.defaultForm;
const inferredDescription: string = inferredHook.describeHook();
const callableHook: (sails: Sails.Application) => object = explicitlyTypedHook;
const publicHookContract: DefinedRedboxHook = inferredHook;

export const defineRedboxHookCompatibility = {
  callableHook,
  explicitDescription,
  explicitFormName,
  inferredDescription,
  inferredFormName,
  publicHookContract,
};
