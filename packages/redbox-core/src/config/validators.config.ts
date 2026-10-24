/**
 * Validators Config
 *
 * Configuration for the validators available in the core redbox project.
 *
 * Validator definitions are selected explicitly at composition.
 * This is because the functions require utility functions,
 * which are provided to the client through the supported explicit client configuration.
 */

import {FormValidatorDefinition, formValidatorsSharedDefinitions} from "@researchdatabox/sails-ng-common";

export interface ValidatorsConfig {
    definitions: FormValidatorDefinition[];
}

export const validators: ValidatorsConfig = {
    definitions: formValidatorsSharedDefinitions,
};
