import {
    FormValidatorConfig,
    FormValidatorControl,
    FormValidatorDefinition,
    FormValidatorErrors
} from "../../src/validation/form.model";
import {
    formValidatorGetDefinitionBoolean, formValidatorGetDefinitionItem, formValidatorGetDefinitionNumber,
    formValidatorGetDefinitionString,
    formValidatorLengthOrSize
} from "../../src/validation/helpers";
import {ValidatorsSupport} from "../../src/validation/validators-support";


const exampleValidatorDefinitions: FormValidatorDefinition[] = [
  {
    name: "required",
    message: "@validator-error-required",
    create: (config) => {
      const optionNameKey = "name";
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
    name: "pattern",
    message: "@validator-error-pattern",
    create: (config) => {
      const optionNameKey = "name";
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

        if (pattern.charAt(0) !== "^") regexStr += "^";

        regexStr += pattern;

        if (pattern.charAt(pattern.length - 1) !== "$") regexStr += "$";

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
    name: "minLength",
    message: "@validator-error-min-length",
    create: (config) => {
      const optionNameKey = "name";
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
];

describe("Validators", async () => {
  const chai = await import("chai");
  const createSimpleControl = (value: unknown): FormValidatorControl => {
    return {
      get<P>(path: P): FormValidatorControl | null {
        return null;
      },
      setErrors(errors: FormValidatorErrors | null): void {
      },
      value: value,
    };
  };
  const cases: {
    args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
    expected: FormValidatorErrors;
  }[] = [
    {
      args: { value: null, definition: [exampleValidatorDefinitions[0]], block: { name: "required" } },
      expected: { required: { message: "@validator-error-required", params: { actual: null, required: true } } },
    },
    {
      args: {
        value: "a", definition: [exampleValidatorDefinitions[1]],
        block: { name: "pattern", config: { pattern: /prefix.*/, description: "must start with prefix" } },
      },
      expected: {
        pattern: {
          message: "@validator-error-pattern",
          params: { actual: "a", description: "must start with prefix", requiredPattern: "/prefix.*/" },
        },
      },
    },
    {
      args: {
        value: "b", definition: [exampleValidatorDefinitions[2]],
        block: { name: "minLength", message: "@validator-error-custom-text_2", config: { minLength: 3 } },
      },
      expected: { minLength: { message: "@validator-error-custom-text_2", params: { actualLength: 1, requiredLength: 3 } } },
    },
  ];
  cases.forEach(({ args, expected }) => {
    it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
      const fns = new ValidatorsSupport().createFormValidatorInstances(args.definition, [args.block]);
      chai.expect(fns).to.have.length(1);
      chai.expect(fns[0](createSimpleControl(args.value))).to.eql(expected);
    });
  });
});
