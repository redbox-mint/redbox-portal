import { FormValidatorDefinition } from "./form.model";
import {
  formValidatorBuildError,
  formValidatorGetDefinitionArray,
  formValidatorGetDefinitionBoolean,
  formValidatorGetDefinitionItem,
  formValidatorGetDefinitionNumber,
  formValidatorGetDefinitionRegexp,
  formValidatorGetDefinitionString,
  formValidatorLengthOrSize
} from "./helpers";
import { JSONataEvaluate } from "../jsonata-helpers";

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  const lengthOrSize = formValidatorLengthOrSize(value);
  if (lengthOrSize !== null) {
    return lengthOrSize > 0;
  }
  return true;
}

function hasLegacyRequiredValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  const lengthOrSize = formValidatorLengthOrSize(value);
  if (lengthOrSize !== null) {
    return lengthOrSize > 0;
  }
  return true;
}

function hasRequiredFieldValue(value: unknown, fieldNames: string[]): boolean {
  if (fieldNames.length === 0) {
    return hasLegacyRequiredValue(value);
  }
  if (Array.isArray(value)) {
    return value.some(item => hasRequiredFieldValue(item, fieldNames));
  }
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return fieldNames.some(fieldName => hasMeaningfulValue(candidate[fieldName]));
}


/**
 * A regular expression for validating an email address.
 *
 * Based on the angular email validation regex. MIT-style license https://angular.dev/license
 */
export const FORM_VALIDATOR_EMAIL_REGEXP = /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Definitions of form validators.
 *
 * These can be used on both server-side and client-side.
 * The server provides them to the client.
 *
 * Sails hooks can use these validators functions, but cannot extend or override them.
 * Use the 'jsonata-expression' validator to create custom validator functions.
 *
 * The validators are based on:
 * - angular built-in validators: https://github.com/angular/angular/blob/5105fd6f05f01f04873ab1c87d64079fd8519ad4/packages/forms/src/validators.ts
 * - formly schema: https://github.com/ngx-formly/ngx-formly/blob/a2f7901b6c0895aee63b4b5fe748fc5ec0ad5475/src/core/src/lib/models/fieldconfig.ts
 */
export const formValidatorsSharedDefinitions: FormValidatorDefinition[] = [
  {
    class: "min",
    message: "@validator-error-min",
    create: (config) => {
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
          return formValidatorBuildError(config, {
            requiredThreshold: optionMinValue,
            actual: control.value,
          });
        }
        return null;
      };
    },
  },
  {
    class: "max",
    message: "@validator-error-max",
    create: (config) => {
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
          return formValidatorBuildError(config, {
            requiredThreshold: optionMaxValue,
            actual: control.value,
          });
        }
        return null;
      };
    },
  },
  {
    class: "minLength",
    message: "@validator-error-min-length",
    create: (config) => {
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
          ? formValidatorBuildError(config, {
            requiredLength: optionMinLengthValue,
            actualLength: length,
          })
          : null;
      };
    },
  },
  {
    class: "maxLength",
    message: "@validator-error-max-length",
    create: (config) => {
      const optionMaxLengthKey = "maxLength";
      const optionMaxLengthValue = formValidatorGetDefinitionNumber(config, optionMaxLengthKey);
      return (control) => {
        const length = formValidatorLengthOrSize(control.value);
        if (length !== null && length > optionMaxLengthValue) {
          return formValidatorBuildError(config, {
            requiredLength: optionMaxLengthValue,
            actualLength: length,
          });
        }
        return null;
      };
    },
  },
  {
    class: "required",
    message: "@validator-error-required",
    create: (config) => {
      const optionRequiredKey = "required";
      const optionRequiredValue = formValidatorGetDefinitionBoolean(config, optionRequiredKey, true);
      const optionAnyOfFields = Array.isArray(config?.['anyOfFields'])
        ? config['anyOfFields'].map(item => item?.toString() ?? "").filter(item => item.length > 0)
        : [];
      return (control) => {
        if (!optionRequiredValue) {
          return null;
        }
        const isValid = optionAnyOfFields.length > 0
          ? hasRequiredFieldValue(control.value, optionAnyOfFields)
          : control.value != null && formValidatorLengthOrSize(control.value) !== 0;
        if (!isValid) {
          return formValidatorBuildError(config, {
            required: optionRequiredValue,
            actual: control.value,
          });
        }
        return null;
      };
    },
  },
  {
    class: "requiredTrue",
    message: "@validator-error-required-true",
    create: (config) => {
      const optionRequiredKey = "requiredTrue";
      const optionRequiredValue = formValidatorGetDefinitionBoolean(config, optionRequiredKey, true);
      return (control) => {
        if (optionRequiredValue && control.value !== true) {
          return formValidatorBuildError(config, {
            required: optionRequiredValue,
            actual: control.value,
          });
        }
        return null;
      };
    },
  },
  {
    class: "email",
    message: "@validator-error-email",
    create: (config) => {
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
          return formValidatorBuildError(config, {
            requiredPattern: optionPatternValue,
            description: optionDescriptionValue, actual: control.value,
          });
        }
        return null;
      };
    },
  },
  {
    class: "pattern",
    message: "@validator-error-pattern",
    create: (config) => {
      const optionDescriptionKey = "description";
      const optionDescriptionValue = formValidatorGetDefinitionString(config, optionDescriptionKey);
      const optionPatternKey = "pattern";
      const pattern = formValidatorGetDefinitionItem(config, optionPatternKey);
      let regex: RegExp;
      let regexStr = (pattern instanceof RegExp ? pattern?.source : pattern?.toString()) ?? "";

      // The pattern must start with '^' (start anchor)
      if (regexStr.charAt(0) !== "^") {
        regexStr = ("^" + regexStr);
      }

      // The pattern must end with '$' (end anchor).
      if (regexStr.charAt(regexStr.length - 1) !== "$") {
        regexStr = (regexStr + "$");
      }

      regex = new RegExp(regexStr);

      return (control) => {
        if (control.value == null || formValidatorLengthOrSize(control.value) === 0) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = control.value?.toString();
        return regex.test(value)
          ? null
          : formValidatorBuildError(config, {
            requiredPattern: regexStr,
            description: optionDescriptionValue,
            actual: value,
          });
      };
    },
  },
  {
    class: "different-values",
    message: "@validator-error-different-values",
    create: (config) => {
      const optionControlNamesKey = "controlNames";
      const optionControlNamesValue = formValidatorGetDefinitionArray(config, optionControlNamesKey);
      return (control) => {
        // TODO: fix how control values are obtained - need to use full angular component path
        const controls = (optionControlNamesValue ?? [])
          ?.filter(i => i !== null && i !== undefined)
          ?.map(n => control?.get(n?.toString())) ?? [];
        const values = new Set(controls?.map(c => c?.value) ?? []);
        const compare = values.size === controls.length;
        return compare
          ? null
          : formValidatorBuildError(config, {
            controlNames: optionControlNamesValue,
            controlCount: optionControlNamesValue?.length,
            valueCount: values.size,
            values: Array.from(values),
          });
      };
    },
  },
  {
    class: "jsonata-expression",
    message: "@validator-error-jsonata-expression",
    createAsync: (config) => {
      const optionDescriptionKey = "description";
      const optionDescriptionValue = formValidatorGetDefinitionString(config, optionDescriptionKey, "");
      const optionExpressionKey = "expression";
      const expression = formValidatorGetDefinitionItem(config, optionExpressionKey);
      const optionEvaluatorKey = "evaluator";
      const evaluator = formValidatorGetDefinitionItem(config, optionEvaluatorKey) as JSONataEvaluate;
      return async (control) => {

        // Notes:
        // 1. For the jsonata-expression validator, always validate the control value.
        //    This enables the expression to decide whether empty values are valid or not.
        //    If empty values were not validated, then the expression would not have the option to treat empty values as invalid.
        // 2. jsonata tries to define a 'keepSingleton' property on the input value.
        //    Must clone the value because control values cannot be extended.
        //    See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cant_define_property_object_not_extensible

        let success: boolean | null = null;

        let value;
        try {
          value = structuredClone(control.value);
        } catch (err) {
          success = false;
          console.error(`Validator 'jsonata-expression' with description '${optionDescriptionValue}' could not run due to error: control value cannot be cloned`);
        }

        if (success === null && typeof evaluator !== "function") {
          success = false;
          console.error(`Validator 'jsonata-expression' with description '${optionDescriptionValue}' could not run due to error: evaluator is not a function`);
        }

        if (success === null) {
          try {
            success = await evaluator(value) === true;
          } catch (err) {
            success = false;
            console.error(`Validator 'jsonata-expression' with description '${optionDescriptionValue}' could not run due to error: ${err}`);
          }
        }

        return success
          ? null
          : formValidatorBuildError(config, {
            expression: expression,
            description: optionDescriptionValue,
            actual: control.value,
          });
      };
    },
  },
  // Validates an ORCID identifier. Details on the ORCID format and checksum can be found at https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier
  {
    class: "orcid",
    message: "@validator-error-orcid",
    create: (config) => {
      return (control) => {
        if (control.value == null || control.value === "") {
          return null; // don't validate empty values
        }

        let value = control.value.toString();

        // Validate format: either xxxx-xxxx-xxxx-xxxx or xxxxxxxxxxxxxxxx, last digit can be X or x
        if (!/^(\d{4}-\d{4}-\d{4}-\d{3}[\dXx]|\d{15}[\dXx])$/.test(value)) {
          return formValidatorBuildError(config, {
            actual: control.value,
          });
        }

        value = value.replace(/-/g, '');

        if (value.length !== 16) {
          return formValidatorBuildError(config, {
            actual: control.value,
          });
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

        if (checkDigit.toUpperCase() !== calculatedCheckDigit) {
          return formValidatorBuildError(config, {
            actual: control.value,
          });
        }
        return null;
      };
    },
  },
  // Validates a URL using the WHATWG URL parser. By default only absolute http(s) URLs pass.
  // Configuration options (all optional):
  // - schemes: string[]      allowed schemes for absolute URLs (default ["http", "https"]).
  //                          An empty array allows any scheme.
  // - allowAbsolute: boolean accept absolute URLs, e.g. "https://example.org/x" (default true).
  // - allowRelative: boolean accept relative references, e.g. "/path", "page?q=1", "../x"
  //                          (default false). Protocol-relative values ("//host/x") are rejected.
  // - requireTld: boolean    when accepting an absolute URL, require the host to contain a dot,
  //                          e.g. reject "http://localhost" (default false).
  // - description: string    included in the error params for custom messaging.
  {
    class: "url",
    message: "@validator-error-url",
    create: (config) => {
      const optionDescriptionValue = formValidatorGetDefinitionString(config, "description", "");
      const allowAbsolute = formValidatorGetDefinitionBoolean(config, "allowAbsolute", true);
      const allowRelative = formValidatorGetDefinitionBoolean(config, "allowRelative", false);
      const requireTld = formValidatorGetDefinitionBoolean(config, "requireTld", false);
      const schemes = formValidatorGetDefinitionArray(config, "schemes", ["http", "https"])
        .map((scheme) => (scheme?.toString() ?? "").trim().toLowerCase().replace(/:$/, ""))
        .filter((scheme) => scheme.length > 0);
      return (control) => {
        if (control.value == null || formValidatorLengthOrSize(control.value) === 0) {
          return null; // don't validate empty values to allow optional controls
        }
        const candidate = control.value.toString().trim();
        if (candidate.length === 0) {
          return null; // treat whitespace-only values as empty/optional
        }

        const buildError = () => formValidatorBuildError(config, {
          description: optionDescriptionValue,
          schemes,
          allowAbsolute,
          allowRelative,
          actual: control.value,
        });

        // Try to parse as an absolute URL first. A successful parse means the value has a scheme.
        let absolute: URL | null = null;
        try {
          absolute = new URL(candidate);
        } catch {
          absolute = null;
        }

        if (absolute) {
          if (!allowAbsolute) {
            return buildError();
          }
          const scheme = absolute.protocol.replace(/:$/, "").toLowerCase();
          if (schemes.length > 0 && !schemes.includes(scheme)) {
            return buildError();
          }
          if (requireTld && !absolute.hostname.includes(".")) {
            return buildError();
          }
          return null;
        }

        // Not absolute, so treat it as a relative reference.
        if (!allowRelative) {
          return buildError();
        }
        // Protocol-relative values resolve to an arbitrary host, escaping the relative scope.
        if (candidate.startsWith("//")) {
          return buildError();
        }
        try {
          // Resolving against a base only throws for malformed relative references.
          new URL(candidate, "http://relative.invalid/");
        } catch {
          return buildError();
        }
        return null;
      };
    },
  },
];
