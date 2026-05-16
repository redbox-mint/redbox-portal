import {FormControl} from '@angular/forms';
import {FormFieldBaseComponent, FormFieldCompMapEntry, ModifyOptions} from '@researchdatabox/portal-ng-common';
import {FormExpressionsConfigFrame} from '@researchdatabox/sails-ng-common';

/**
 * Minimal binding harness for exercising the consumer without needing a full
 * rendered form component tree.
 * @param opts
 */
export function createSetup(opts?: {
  expressions?: FormExpressionsConfigFrame[],
  initialFormControlValue?: unknown,
  includeLayout?: boolean
} | FormExpressionsConfigFrame[]) {
  // cater for different ways of calling the function
  if (opts === undefined) {
    opts = {};
  }
  if (Array.isArray(opts)) {
    opts = {expressions: opts};
  }

  // set up the required pieces
  const control = new FormControl(opts?.initialFormControlValue ?? '');
  const model = {
    formControl: control,
    setDisabled: (disabled: boolean, opts?: ModifyOptions) => {
      throw new Error(`setDisabled ${JSON.stringify({disabled, opts})}`);
    },
  }
  const component = {
    formFieldConfigName: () => 'test-field',
    model: model,
    componentDefinition: {config: {}},
    setProperty: (name: string, value: unknown) => {
      throw new Error(`setProperty ${JSON.stringify({name, value})}`);
    },
  } as unknown as FormFieldBaseComponent<unknown>;
  const layout = (opts?.includeLayout ?? true) ? {
    componentDefinition: {config: {}},
    setProperty: (name: string, value: unknown) => {
      throw new Error(`setProperty ${JSON.stringify({name, value})}`);
    },
  } : undefined;
  const definition = {
    model: model,
    expressions: opts?.expressions ?? [],
    lineagePaths: {formConfig: ['root']},
    layout: layout,
    component: component,
  } as unknown as FormFieldCompMapEntry;
  return {control, model, component, layout, definition};
}
