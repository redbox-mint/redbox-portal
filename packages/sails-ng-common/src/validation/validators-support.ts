import { FormValidatorConfig, FormValidatorDefinition, FormValidatorFn } from ".";

export class ValidatorsSupport {
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

    const result: FormValidatorFn[] = [];
    for (const validatorConfigItem of (config ?? [])) {
      const name = validatorConfigItem?.name;
      const def = defMap.get(name);
      if (!def) {
        throw new Error(`No validator definition has name '${name}', `
          + `the available validators are: '${Array.from(defMap.keys()).sort().join(", ")}'.`);
      }
      const message = validatorConfigItem?.message ?? def.message;
      const item = def.create({ name: name, message: message, ...(validatorConfigItem?.config ?? {}) });
      result.push(item);
    }
    return result;
  }
}
