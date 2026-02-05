import {
    FormValidationGroups, FormValidatorComponentErrors,
    FormValidatorConfig,
    FormValidatorDefinition, FormValidatorErrors,
    FormValidatorFn
} from "./form.model";
import {isTypeFormValidatorDefinition} from "../config/form-types.model";
import {LineagePath} from "../config/names/naming-helpers";

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

    /**
     * Is the validator enabled?
     * @param availableGroups
     * @param enabledGroups
     * @param validator
     */
    public isValidatorEnabled(availableGroups: FormValidationGroups, enabledGroups: string[], validator: FormValidatorConfig): boolean {
        // If there are no validation groups, all validators are enabled.
        if (Object.keys(availableGroups).length === 0) {
            return true;
        }
        // Check each validation group to see if the validator is enabled.
        // A validator must pass all the group checks to be enabled.
        for (const [groupKey, groupConfig] of Object.entries(availableGroups)) {
            if (!enabledGroups?.includes(groupKey)) {
                continue;
            }
            const membership = groupConfig?.initialMembership ?? "none";
            const include = validator?.groups?.include ?? [];
            const exclude = validator?.groups?.exclude ?? [];
            if (membership === "all" && exclude.includes(groupKey)) {
                return false;
            }
            if (membership === "none" && !include.includes(groupKey)) {
                return false;
            }
            if (exclude.includes(groupKey)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get the enabled validators.
     * @param availableGroups
     * @param enabledGroups
     * @param validators
     */
    public enabledValidators(availableGroups: FormValidationGroups, enabledGroups: string[], validators: FormValidatorConfig[]): FormValidatorConfig[] {
        return (validators ?? []).filter(validator => this.isValidatorEnabled(availableGroups, enabledGroups,validator));
    }
}
