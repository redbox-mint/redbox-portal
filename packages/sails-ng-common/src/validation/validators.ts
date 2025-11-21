import {FormValidatorControl, FormValidatorDefinition} from "./form.model";
import {
    formValidatorGetDefinitionArray,
    formValidatorGetDefinitionBoolean, formValidatorGetDefinitionItem,
    formValidatorGetDefinitionNumber,
    formValidatorGetDefinitionRegexp, formValidatorGetDefinitionString, formValidatorLengthOrSize
} from "./helpers";



/**
 * A regular expression for validating an email address.
 *
 * Based on the angular email validation regex. MIT-style license https://angular.dev/license
 */
export const FORM_VALIDATOR_EMAIL_REGEXP = /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Definitions of shared form validators.
 *
 * These can be used on both server-side and client-side. The server provides them to the client.
 * These are the shared / common definitions.
 * ReDBox implementations can modify these validation definitions or add more.
 *
 * The validators are based on:
 * angular built-in validators: https://github.com/angular/angular/blob/5105fd6f05f01f04873ab1c87d64079fd8519ad4/packages/forms/src/validators.ts
 * formly schema: https://github.com/ngx-formly/ngx-formly/blob/a2f7901b6c0895aee63b4b5fe748fc5ec0ad5475/src/core/src/lib/models/fieldconfig.ts
 *
 * These validation definitions need to be on the server-side, and provided to the client-side from the server.
 * There are two sets of validator definitions - 1) shared / common definitions in the core; 2) definitions specific to a client.
 *    These two set of definitions need to be merged and provided by the server to the client.
 */
export const formValidatorsSharedDefinitions: FormValidatorDefinition[] = [
  {
    class: "min",
    message: "@validator-error-min",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "min");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-min");
      const optionMinKey = "min";
      const optionMinValue = formValidatorGetDefinitionNumber(config, optionMinKey);
      return (control) => {
        if (control.value == null || optionMinValue == null) {
          return null; // don't validate empty values to allow optional controls
        }

        let value;
        try {
            value = parseFloat(control.value?.toString() ?? null);
        } catch (err) {
            value = undefined;
        }

        // Controls with NaN values after parsing should be treated as not having a
        // minimum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-min
        if (value === undefined || (!isNaN(value) && value < optionMinValue)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                requiredThreshold: optionMinValue,
                actual: control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "max",
    message: "@validator-error-max",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "max");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-max");
      const optionMaxKey = "max";
      const optionMaxValue = formValidatorGetDefinitionNumber(config, optionMaxKey);
      return (control) => {
        if (control.value == null || optionMaxValue == null) {
          return null; // don't validate empty values to allow optional controls
        }

        let value;
        try {
            value = parseFloat(control.value?.toString() ?? null);
        } catch (err) {
            value = undefined;
        }

        // Controls with NaN values after parsing should be treated as not having a
        // maximum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-max
          if (value === undefined || (!isNaN(value) && value > optionMaxValue)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                requiredThreshold: optionMaxValue,
                actual: control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "minLength",
    message: "@validator-error-min-length",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "minLength");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-min-length");
      const optionMinLengthKey = "minLength";
      const optionMinLengthValue = formValidatorGetDefinitionNumber(config, optionMinLengthKey);
      return (control) => {
        const length = formValidatorLengthOrSize(control.value);
        if (length === null || length === 0) {
          // don't validate empty values to allow optional controls
          // don't validate values without `length` or `size` property
          return null;
        }

        return length < optionMinLengthValue
          ? {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                requiredLength: optionMinLengthValue,
                actualLength: length,
              },
            },
          }
          : null;
      };
    },
  },
  {
    class: "maxLength",
    message: "@validator-error-max-length",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "maxLength");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-max-length");
      const optionMaxLengthKey = "maxLength";
      const optionMaxLengthValue = formValidatorGetDefinitionNumber(config, optionMaxLengthKey);
      return (control) => {
        const length = formValidatorLengthOrSize(control.value);
        if (length !== null && length > optionMaxLengthValue) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                requiredLength: optionMaxLengthValue,
                actualLength: length,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "required",
    message: "@validator-error-required",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "required");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-required");
      const optionRequiredKey = "required";
      const optionRequiredValue = formValidatorGetDefinitionBoolean(config, optionRequiredKey, true);
      return (control) => {
        if (optionRequiredValue && (control.value == null || formValidatorLengthOrSize(control.value) === 0)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                required: optionRequiredValue,
                actual: control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "requiredTrue",
    message: "@validator-error-required-true",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "requiredTrue")?.toString() ?? "";
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-required-true");
      const optionRequiredKey = "requiredTrue";
      const optionRequiredValue = formValidatorGetDefinitionBoolean(config, optionRequiredKey, true);
      return (control) => {
        if (optionRequiredValue && control.value !== true) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                required: optionRequiredValue,
                actual: control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "email",
    message: "@validator-error-email",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "email");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-email");
      const optionDescriptionKey = "description";
      const optionDescriptionValue = formValidatorGetDefinitionString(config, optionDescriptionKey, "email must be in format (name)@(domain.tld)");
      const optionPatternKey = "pattern";
      const optionPatternValue = formValidatorGetDefinitionRegexp(config, optionPatternKey, FORM_VALIDATOR_EMAIL_REGEXP);
      return (control) => {
        if (control.value == null || formValidatorLengthOrSize(control.value) === 0) {
          // don't validate empty values to allow optional controls
          return null;
        }

        const value = control.value?.toString() ?? "";
        const testOutcome = optionPatternValue.test(value);
        if (!testOutcome) {
        return {
          [optionNameValue]: {
            [optionMessageKey]: optionMessageValue,
            params: {
              requiredPattern: optionPatternValue,

              description: optionDescriptionValue,actual: control.value,
            },
          },
          };
        }
        return null;
      };
    },
  },
  {
    class: "pattern",
    message: "@validator-error-pattern",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "pattern");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-pattern");
      const optionDescriptionKey = "description";
      const optionDescriptionValue = formValidatorGetDefinitionString(config, optionDescriptionKey);
      const optionPatternKey = "pattern";
      const pattern = formValidatorGetDefinitionItem(config, optionPatternKey);
      let regex: RegExp;
      let regexStr: string;
      if (typeof pattern === "string") {
        regexStr = "";
        if (pattern.charAt(0) !== "^") regexStr = ("^" + regexStr);
        regexStr += pattern;
        if (pattern.charAt(pattern.length - 1) !== "$") regexStr = (regexStr + "$");
        regex = new RegExp(regexStr);
      } else if (pattern instanceof RegExp) {
        regexStr = pattern.toString();
        regex = pattern;
      }
      return (control) => {
        if (control.value == null || formValidatorLengthOrSize(control.value) === 0) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = control.value?.toString();
        return regex.test(value)
          ? null
          : {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                requiredPattern: regexStr,
                description: optionDescriptionValue,
                actual: value,
              },
            },
          };
      };
    },
  },
  {
    class: "different-values",
    message: "@validator-error-different-values",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "different-values");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-different-values");
      const optionControlNamesKey = "controlNames";
      const optionControlNamesValue = formValidatorGetDefinitionArray(config, optionControlNamesKey);
      return (control) => {
        const controls = (optionControlNamesValue ?? [])
          ?.filter(i => i !== null && i !== undefined)
          ?.map(n => control?.get(n?.toString())) ?? [];
        const values = new Set(controls?.map(c => c?.value) ?? []);
        if (values.size !== controls.length) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                controlNames: optionControlNamesValue,
                controlCount: optionControlNamesValue?.length,
                valueCount: values.size,
                values: Array.from(values),
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    class: "jsonata-expression",
    message: "@validator-error-jsonata-expression",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "jsonata-expression");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-jsonata-expression");
      const optionDescriptionKey = "description";
      let optionDescriptionValue = formValidatorGetDefinitionString(config, optionDescriptionKey);
      const optionExpressionKey = "expression";
      const expression = formValidatorGetDefinitionItem(config, optionExpressionKey);
      const optionEvaluatorKey = "evaluator";
      const evaluator = formValidatorGetDefinitionItem(config, optionEvaluatorKey) as (control: FormValidatorControl) => boolean;
      return (control) => {
          if (control.value == null || formValidatorLengthOrSize(control.value) === 0) {
              return null; // don't validate empty values to allow optional controls
          }
          const value = control.value?.toString();
          let success: boolean;
          try {
              success = evaluator(control)
          } catch (err) {
              success = false;
              optionDescriptionValue = "the validator is not configured correctly"
              console.error(`Validator 'jsonata-expression' could not run due to error: ${err}`);
          }
          return success
              ? null
              : {
                  [optionNameValue]: {
                      [optionMessageKey]: optionMessageValue,
                      params: {
                          expression: expression,
                          description: optionDescriptionValue,
                          actual: value,
                      },
                  },
              };
      };
    },
  },
  {
    class: "orcid",
    message: "@validator-error-orcid",
    create: (config) => {
      const optionNameKey = "class";
      const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey, "orcid");
      const optionMessageKey = "message";
      const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey, "@validator-error-orcid");

      return (control) => {
        if (control.value == null || control.value === "") {
          return null; // don't validate empty values
        }

        let value = control.value.toString();

        // Validate format: either xxxx-xxxx-xxxx-xxxx or xxxxxxxxxxxxxxxx
        if (!/^(\d{4}-\d{4}-\d{4}-\d{3}[\dX]|\d{15}[\dX])$/i.test(value)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                actual: control.value,
              },
            },
          };
        }

        value = value.replace(/-/g, '');

        if (value.length !== 16 || !/^\d{15}[\dX]$/i.test(value)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                actual: control.value,
              },
            },
          };
        }

        const baseDigits = value.substring(0, 15);
        const checkDigit = value.substring(15);

        let total = 0;
        for (let i = 0; i < baseDigits.length; i++) {
          const digit = parseInt(baseDigits.charAt(i), 10);
          total = (total + digit) * 2;
        }
        const remainder = total % 11;
        const result = (12 - remainder) % 11;
        const calculatedCheckDigit = result === 10 ? "X" : result.toString();

        if (checkDigit !== calculatedCheckDigit) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                actual: control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
];
