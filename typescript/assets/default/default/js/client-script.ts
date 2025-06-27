// Reference the entry style files, relative to the compiled js output file.
// This is needed for webpack to generate the compiled styles.
import "../../../styles/style.scss";
import "../../../styles/default.css";
import {formValidatorsSharedDefinitions} from "../../../../config/validators";
import {FormValidatorCreateFn} from "@researchdatabox/sails-ng-common";


/**
 * Build a mapping object where the key is the validator name,
 * and the value is the validator 'create' function.
 *
 * This mapping object is made available via a script tag in the ejs HTML templates,
 * so the client-side can use the validator functions
 * and replace the JSON-serialized 'create' functions in the form config.
 */
const validatorFunctionMap: { [key: string]: FormValidatorCreateFn } = {};
for (const item of formValidatorsSharedDefinitions) {
    const key = item.name;
    validatorFunctionMap[key] = item.create;
}

export const providedToClientFromServer = {
    validatorFunctionMap: validatorFunctionMap,
};
