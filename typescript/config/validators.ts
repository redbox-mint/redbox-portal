
// This is the sails config for the validators available in the core redbox project.
// Sails hooks can extend or override these using the _dontMerge or _delete or create a validator definition with the same name.
// To access on the server-side, use 'sails.config.validators.definitions'.
// To access on the client-side, use 'FormService.getDynamicImportFormDataValidations'.
import {formValidatorsSharedDefinitions} from "@researchdatabox/sails-ng-common";

module.exports.validators = {
  definitions: formValidatorsSharedDefinitions,
};
