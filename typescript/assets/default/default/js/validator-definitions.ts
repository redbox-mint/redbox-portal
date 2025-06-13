import {formValidatorsSharedDefinitions} from "../../../../config/validators"


export const formValidatorsSharedFunctions = {};
console.log(formValidatorsSharedDefinitions);
for (const formValidatorsSharedDefinition of formValidatorsSharedDefinitions) {
    const name = formValidatorsSharedDefinition.name;
    formValidatorsSharedFunctions[name] = formValidatorsSharedDefinition.create;
    formValidatorsSharedDefinition['create'] = undefined;
}

module.exports.validatorDefinitions = formValidatorsSharedFunctions;