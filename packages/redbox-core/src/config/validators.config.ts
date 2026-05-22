/**
 * Validators Config
 *
 * Sails config for the validators available in the core redbox project.
 *
 * Sails hooks cannot extend or override these.
 * This is because the functions require utility functions,
 * which are provided to the client in a way that sails hooks cannot extend or override.
 */

import {FormValidatorDefinition, formValidatorsSharedDefinitions} from "@researchdatabox/sails-ng-common";

export interface ValidatorsConfig {
    definitions: FormValidatorDefinition[];
}

export const validators: ValidatorsConfig = {
    definitions: formValidatorsSharedDefinitions,
};
