import {
  FormValidationGroups, FormValidatorComponentErrors,
  FormValidatorConfig, FormValidatorCreateConfig,
  FormValidatorDefinition, FormValidatorErrors,
  FormValidatorFns
} from "./form.model";
import { isTypeFormValidatorDefinition } from "../config/form-types.model";


export class ValidatorsSupport {
  /**
   * Create validator definition mapping from the validator definitions.
   * @param definition The form validator definitions.
   */
  public createValidatorDefinitionMapping(
    definition: FormValidatorDefinition[] | null | undefined
  ): Map<string, FormValidatorDefinition> {
    const defMap = new Map<string, FormValidatorDefinition>();
    for (const definitionItem of (definition ?? [])) {
      if (!isTypeFormValidatorDefinition(definitionItem)) {
        throw new Error(`Validator definition does not have valid 'class', 'message', and 'create' properties: ${JSON.stringify(definitionItem)}`);
      }
      const validatorClass = definitionItem?.class;
      const message = definitionItem?.message;
      if (defMap.has(validatorClass)) {
        const messages = [message, defMap.get(validatorClass)?.message];
        throw new Error(`Duplicate validator class '${validatorClass}' - the validator classes must be unique. `
          + `To help you find the duplicates, these are the messages of the duplicates: '${messages.join(", ")}'.`);
      }
      defMap.set(validatorClass, definitionItem);
    }
    return defMap;
  }

  /**
   * Create form validator instances from the validator definition mapping.
   * @param defMap The validator definition mapping.
   * @param config The form validator config blocks.
   */
  public createFormValidatorInstancesFromMapping(
    defMap: Map<string, FormValidatorDefinition>,
    config: FormValidatorConfig[] | null | undefined,
  ): FormValidatorFns {
    const result: FormValidatorFns = { syncDefs: [], asyncDefs: [] };
    for (const validatorConfigItem of (config ?? [])) {
      const validatorClass = validatorConfigItem?.class;
      const def = defMap.get(validatorClass);
      if (!def) {
        throw new Error(`No validator definition with class '${validatorClass}', `
          + `the available validators are: '${Array.from(defMap.keys()).sort().join(", ")}'.`);
      }
      const message = validatorConfigItem?.message ?? def.message;
      const createConfig: FormValidatorCreateConfig = {
        ...validatorConfigItem?.config ?? {},
        class: validatorClass,
        message: message,
      };

      if ('create' in def) {
        result.syncDefs.push(def.create(createConfig));
      } else if ('createAsync' in def) {
        result.asyncDefs.push(def.createAsync(createConfig));
      } else {
        throw new Error(`Validator definition '${validatorClass}' does not provide a create or createAsync factory.`);
      }
    }
    return result;
  }

  /**
   * Get the form validator errors for a component's control.
   * @param errors The control's errors.
   */
  public getFormValidatorComponentErrors(errors: FormValidatorErrors | null): FormValidatorComponentErrors[] {
    return Object.entries(errors ?? {}).map(([key, item]) => ({
      class: key,
      message: item.message ?? null,
      params: { ...item.params },
    })) ?? [];
  }

  public checkValidationGroups(availableGroups: FormValidationGroups, enabledGroupNames: string[]) {
    const availableGroupNames = Object.keys(availableGroups);
    const unknownGroups = enabledGroupNames.filter(g => !availableGroupNames.includes(g));
    if (unknownGroups.length > 0) {
      throw new Error(`Unknown enabled validation groups ${JSON.stringify(unknownGroups)}.`)
    }
  }

  /**
   * Is the component model validator enabled?
   * @param availableGroups All available validation groups in this form.
   * @param enabledGroupNames The currently enabled validation groups.
   * @param validator The validator config for a component's model.
   */
  public isValidatorEnabled(availableGroups: FormValidationGroups, enabledGroupNames: string[], validator: FormValidatorConfig): boolean {
    if (Object.keys(availableGroups).length === 0) {
      // If there are no validation groups, all validators are enabled.
      return true;
    }
    if (enabledGroupNames.length === 0) {
      // If there are no validation groups enabled, all validators are enabled.
      return true;
    }

    this.checkValidationGroups(availableGroups, enabledGroupNames);

    // Check each validation group to see if the validator is enabled.
    // A validator must pass at least one of the group checks to be enabled.
    const includes = validator?.groups?.include ?? [];
    this.checkValidationGroups(availableGroups, includes);

    const excludes = validator?.groups?.exclude ?? [];
    this.checkValidationGroups(availableGroups, excludes);

    for (const [groupKey, groupConfig] of Object.entries(availableGroups)) {
      const membership = groupConfig?.initialMembership ?? "none";

      if (!enabledGroupNames?.includes(groupKey)) {
        // Group is not enabled, so move on.
        continue;
      }

      if (excludes.includes(groupKey)) {
        // Validator excludes this group, so move on.
        continue;
      }

      if (membership === "all" && !excludes.includes(groupKey)) {
        // Validator is enabled.
        // Group is enabled, starts with all validators, and validator does not exclude it.
        return true;
      }

      if (membership === "none" && includes.includes(groupKey)) {
        // Validator is enabled.
        // Group is enabled, starts with no validators, and validator includes it.
        return true;
      }
    }
    // Validator was not included in any group, so it is disabled.
    return false;
  }

  /**
   * Assign the jsonata evaluator to each 'jsonata-expression' validator.
   * This must be done before filtering the validators on the client, as the compiled templates are referenced by index.
   * @param validators The validator configurations from the model config.
   * @param callback The callback for each validator config with the index.
   */
  public assignJsonataEvaluators(
    validators: FormValidatorConfig[],
    callback: (validator: FormValidatorConfig, index: number) => unknown
  ): void {
    validators.forEach((validator, index) => {
      if (validator.class === "jsonata-expression") {
        if (!validator.config) {
          validator.config = {};
        }
        const expr = validator?.config?.['expression']?.toString() ?? "";
        const evaluator = validator.config?.['evaluator'];
        if (validator.config && expr && !evaluator) {
          validator.config['evaluator'] = callback(validator, index);
        }
      }
    });
  }

  /**
   * Get the enabled validators.
   * @param availableGroups All available validation groups in this form.
   * @param enabledGroups The currently enabled validation groups.
   * @param validators All available validators in this form.
   */
  public enabledValidators(availableGroups: FormValidationGroups, enabledGroups: string[], validators: FormValidatorConfig[]): FormValidatorConfig[] {
    return (validators ?? []).filter(validator => this.isValidatorEnabled(availableGroups, enabledGroups, validator));
  }
}
