import {FormValidatorConfig, FormValidatorDefinition, FormValidatorFn} from "./form.model";

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
            const name = definitionItem?.name;
            const message = definitionItem?.message;
            if (defMap.has(name)) {
                const messages = [message, defMap.get(name)?.message];
                throw new Error(`Duplicate validator name '${name}' - the validator names must be unique. `
                    + `To help you find the duplicates, these are the messages of the duplicates: '${messages.join(", ")}'.`);
            }
            defMap.set(name, definitionItem);
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
            const name = validatorConfigItem?.name;
            const def = defMap.get(name);
            if (!def) {
                throw new Error(`No validator definition has name '${name}', `
                    + `the available validators are: '${Array.from(defMap.keys()).sort().join(", ")}'.`);
            }
            const message = validatorConfigItem?.message ?? def.message;
            const item = def.create({name: name, message: message, ...(validatorConfigItem?.config ?? {})});
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
}
