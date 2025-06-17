import { formValidatorsSharedDefinitions } from "../../../../config/validators";

// Build a mapping object where the key is the validator name, and the value is the validator create function.
// This mapping object is made available via a script tag in the ejs HTML templates,
// so the client-side can use the validator functions and replace the placeholders in the form config.
export const formValidatorsSharedFunctions = {};
console.log(formValidatorsSharedDefinitions);
for (const item of formValidatorsSharedDefinitions) {
  const key = `func_key_${item.name}`;
  formValidatorsSharedFunctions[key] = item.create;
}

module.exports.validatorDefinitions = formValidatorsSharedFunctions;
