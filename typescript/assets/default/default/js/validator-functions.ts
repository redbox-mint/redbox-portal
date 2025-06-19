import {formValidatorsSharedDefinitions} from "../../../../config/validators";
import {buildValidatorFunctionMap} from "../../../../form-config/form-config-support";

module.exports.validatorFunctions = {
  functionsMap: buildValidatorFunctionMap(formValidatorsSharedDefinitions),
};
