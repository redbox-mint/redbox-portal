/**
 * Validators Config
 *
 * Sails config for the validators available in the core redbox project.
 * Sails hooks can extend or override these using the _dontMerge or _delete
 * or create a validator definition with the same name.
 */

import {
  FormValidatorDefinition,
  formValidatorsSharedDefinitions,
  validatorCustomLibrary
} from "@researchdatabox/sails-ng-common";

export interface ValidatorsConfig {
    definitions: FormValidatorDefinition[];
    customLibrary: Record<string, unknown>;
}

export const validators: ValidatorsConfig = {
    definitions: formValidatorsSharedDefinitions,
    customLibrary: validatorCustomLibrary,
};
