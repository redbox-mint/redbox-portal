import {
    FormValidatorConfig,
    FormValidatorDefinition,
    FormValidatorErrors,
    formValidatorsSharedDefinitions,
    SimpleServerFormValidatorControl,
    ValidatorsSupport,
} from "../../src";

describe("Validators", async () => {
  const chai = await import("chai");
  const cases: {
    args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
    expected: FormValidatorErrors;
  }[] = [
      // TODO: min
      // TODO: max
      {
          // minLength
          args: {
              value: "b", definition: formValidatorsSharedDefinitions,
              block: { name: "minLength", message: "@validator-error-custom-text_2", config: { minLength: 3 } },
          },
          expected: { minLength: { message: "@validator-error-custom-text_2", params: { actualLength: 1, requiredLength: 3 } } },
      },
      // TODO: maxLength
    {
        // required
      args: { value: null, definition: formValidatorsSharedDefinitions, block: { name: "required" } },
      expected: { required: { message: "@validator-error-required", params: { actual: null, required: true } } },
    },
      // TODO: requiredTrue
      // TODO: email

    {
        // pattern
      args: {
        value: "a", definition: formValidatorsSharedDefinitions,
        block: { name: "pattern", config: { pattern: /prefix.*/, description: "must start with prefix" } },
      },
      expected: {
        pattern: {
          message: "@validator-error-pattern",
          params: { actual: "a", description: "must start with prefix", requiredPattern: "/prefix.*/" },
        },
      },
    },
      // TODO: different-values
      // TODO: jsonata-expression
  ];
  cases.forEach(({ args, expected }) => {
    it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
      const fns = new ValidatorsSupport().createFormValidatorInstances(args.definition, [args.block]);
      chai.expect(fns).to.have.length(1);
      chai.expect(fns[0](new SimpleServerFormValidatorControl(args.value))).to.eql(expected);
    });
  });
});
