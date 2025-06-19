import {FormValidatorCreateFn, FormValidatorDefinition} from "@researchdatabox/sails-ng-common";

/**
 * Build a mapping object where the key is the validator name, and the value is the validator create function.
 * This mapping object is made available via a script tag in the ejs HTML templates,
 * so the client-side can use the validator functions and replace the placeholders in the form config.
 *
 * @param keyPlaceholderPrefix
 * @param validatorDefinitions
 */
export function buildValidatorFunctionMap(
  validatorDefinitions: FormValidatorDefinition[],
  keyPlaceholderPrefix: string = "validator_create_key_",
) {
  const mapping: { [key: string]: FormValidatorCreateFn } = {};
  for (const item of validatorDefinitions) {
    const key = `${keyPlaceholderPrefix}${item.name}`;
    mapping[key] = item.create;
  }
  return mapping;
}

/**
 * Build an array where each validation definition object has a placeholder string instead of the validator function.
 * This array is included in the FormConfig object provided by the server to the client,
 * and the client-side uses these placeholder keys together with the validator functions
 * provided in the compiled validator-functions.js to obtain the functions.
 *
 * @param validatorDefinitions The validator definitions.
 * @param keyPlaceholderPrefix The prefix to use for constructing the placeholder value.
 */
export function buildValidatorDefinitionWithPlaceholders(
  validatorDefinitions: FormValidatorDefinition[],
  keyPlaceholderPrefix: string = "validator_create_key_",
) {
  const withPlaceholders: { name: string, message: string, create: string }[] = [];
  for (const item of validatorDefinitions) {
    withPlaceholders.push({
      name: item.name,
      message: item.message,
      create: `${keyPlaceholderPrefix}${item.name}`,
    });
  }
  return withPlaceholders;
}
