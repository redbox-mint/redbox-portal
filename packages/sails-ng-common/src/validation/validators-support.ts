import {
    FormValidationGroups, FormValidatorComponentErrors,
    FormValidatorConfig,
    FormValidatorDefinition, FormValidatorErrors,
    FormValidatorFn
} from "./form.model";
import {isTypeFormValidatorDefinition} from "../config/form-types.model";

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
    ): FormValidatorFn[] {
        const result: FormValidatorFn[] = [];
        for (const validatorConfigItem of (config ?? [])) {
            const validatorClass = validatorConfigItem?.class;
            const def = defMap.get(validatorClass);
            if (!def) {
                throw new Error(`No validator definition with class '${validatorClass}', `
                    + `the available validators are: '${Array.from(defMap.keys()).sort().join(", ")}'.`);
            }
            const message = validatorConfigItem?.message ?? def.message;
            const item = def.create({class: validatorClass, message: message, ...(validatorConfigItem?.config ?? {})});

            // for debugging:
            // const getter = function (path: string | LineagePath) {
            //     return path as any
            // };
            // const examples = {
            //     'empty': item({value: null, get: getter}),
            //     'filled': item({value: "some-value", get: getter})
            // };
            // console.log(`createFormValidatorInstancesFromMapping validatorClass ${validatorClass} validatorConfigItem ${JSON.stringify(validatorConfigItem)} examples ${JSON.stringify(examples)}`);

            result.push(item);
        }
        return result;
    }

    /**
     * Create instances of the given form validators.
     *
     * @param definition The form validator definitions.
     * @param config The form validator config blocks.
     */
    public createFormValidatorInstances(
        definition: FormValidatorDefinition[] | null | undefined,
        config: FormValidatorConfig[] | null | undefined,
    ): FormValidatorFn[] {
        const defMap = this.createValidatorDefinitionMapping(definition);
        return this.createFormValidatorInstancesFromMapping(defMap, config);
    }

    /**
     * Get the form validator errors for a component's control.
     * @param errors The control's errors.
     */
    public getFormValidatorComponentErrors(errors: FormValidatorErrors | null): FormValidatorComponentErrors[] {
        return Object.entries(errors ?? {}).map(([key, item]) => ({
                class: key,
                message: item.message ?? null,
                params: {...item.params},
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
     * Get the enabled validators.
     * @param availableGroups All available validation groups in this form.
     * @param enabledGroups The currently enabled validation groups.
     * @param validators All available validators in this form.
     */
    public enabledValidators(availableGroups: FormValidationGroups, enabledGroups: string[], validators: FormValidatorConfig[]): FormValidatorConfig[] {
        return (validators ?? []).filter(validator => this.isValidatorEnabled(availableGroups, enabledGroups, validator));
    }
}
