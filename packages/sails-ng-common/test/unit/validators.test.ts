import {
  FormValidatorConfig,
  FormValidatorDefinition,
  FormValidatorErrors,
  SimpleServerFormValidatorControl,
  FORM_VALIDATOR_EMAIL_REGEXP,
  formValidatorsSharedDefinitions,
  ValidatorsSupport,
  FormValidationGroups,
  jsonataCompile,
  jsonataEvaluate,
} from "../../src";

type TestCase = {
  title: string;
  args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
  expected: FormValidatorErrors | null;
};

describe("Validator", async () => {
  const vs = new ValidatorsSupport();
  let expect: Chai.ExpectStatic;
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  async function checkValidator(testCase: TestCase) {
    const defMap = vs.createValidatorDefinitionMapping(testCase.args.definition);
    const fns = vs.createFormValidatorInstancesFromMapping(defMap, [testCase.args.block]);
    const syncFns = fns.syncDefs;
    const asyncFns = fns.asyncDefs;
    expect(syncFns.length + asyncFns.length).to.eql(1);
    if (syncFns.length > 0) {
      expect(syncFns[0](new SimpleServerFormValidatorControl(testCase.args.value))).to.eql(testCase.expected);
    } else {
      expect(await asyncFns[0](new SimpleServerFormValidatorControl(testCase.args.value))).to.eql(testCase.expected);
    }
  }

  describe("simple definitions", async () => {
    const cases: TestCase[] =
      [
        {
          title: "min - expect failure",
          args: {
            value: 2, definition: formValidatorsSharedDefinitions,
            block: { class: "min", message: "@validator-error-custom-text_2", config: { min: 3 } },
          },
          expected: {
            min: {
              message: "@validator-error-custom-text_2",
              params: { actual: 2, requiredThreshold: 3 }
            }
          },
        },
        {
          title: "min - expect pass",
          // (note, it looks like the HTML WHATWG spec treats a value that cannot be converted to a number as not having a minimum)
          args: {
            value: "aa", definition: formValidatorsSharedDefinitions,
            block: { class: "min", message: "@validator-error-custom-text_2", config: { min: 3 } },
          },
          expected: null,
        },
        {
          title: "min - expect pass",
          args: {
            value: 4, definition: formValidatorsSharedDefinitions,
            block: { class: "min", message: "@validator-error-custom-text_2", config: { min: 3 } },
          },
          expected: null,
        },
        {
          title: "max - expect failure",
          args: {
            value: 6, definition: formValidatorsSharedDefinitions,
            block: { class: "max", message: "@validator-error-custom-text_2", config: { max: 3 } },
          },
          expected: {
            max: {
              message: "@validator-error-custom-text_2",
              params: { actual: 6, requiredThreshold: 3 }
            }
          },
        },
        {
          title: "max - expect pass",
          args: {
            value: "aaa", definition: formValidatorsSharedDefinitions,
            block: { class: "max", message: "@validator-error-custom-text_2", config: { max: 3 } },
          },
          expected: null,
        },
        {
          title: "max - expect pass",
          args: {
            value: 2, definition: formValidatorsSharedDefinitions,
            block: { class: "max", message: "@validator-error-custom-text_2", config: { max: 3 } },
          },
          expected: null,
        },
        {
          title: "minLength - expect failure",
          args: {
            value: "b", definition: formValidatorsSharedDefinitions,
            block: { class: "minLength", message: "@validator-error-custom-text_2", config: { minLength: 3 } },
          },
          expected: {
            minLength: {
              message: "@validator-error-custom-text_2",
              params: { actualLength: 1, requiredLength: 3 }
            }
          },
        },
        {
          title: "minLength - expect pass",
          args: {
            value: "bbb", definition: formValidatorsSharedDefinitions,
            block: { class: "minLength", message: "@validator-error-custom-text_2", config: { minLength: 3 } },
          },
          expected: null,
        },
        {
          title: "maxLength - expect failure",
          args: {
            value: "bbbb", definition: formValidatorsSharedDefinitions,
            block: { class: "maxLength", config: { maxLength: 3 } },
          },
          expected: {
            maxLength: {
              message: "@validator-error-max-length",
              params: { actualLength: 4, requiredLength: 3 }
            }
          },
        },
        {
          title: "maxLength - expect pass",
          args: {
            value: "bbb", definition: formValidatorsSharedDefinitions,
            block: { class: "maxLength", config: { maxLength: 3 } },
          },
          expected: null,
        },
        {
          title: "required - expect failure",
          args: {
            value: null, definition: formValidatorsSharedDefinitions,
            block: { class: "required" }
          },
          expected: {
            required: {
              message: "@validator-error-required",
              params: { actual: null, required: true }
            }
          },
        },
        {
          title: "required - expect pass",
          args: {
            value: null, definition: formValidatorsSharedDefinitions,
            block: { class: "required" }
          },
          expected: {
            required: {
              message: "@validator-error-required",
              params: { actual: null, required: true }
            }
          },
        },
        {
          title: "required whitespace-only string - expect pass",
          args: {
            value: "   ", definition: formValidatorsSharedDefinitions,
            block: { class: "required" }
          },
          expected: null,
        },
        {
          title: "requiredTrue - expect failure",
          args: {
            value: null, definition: formValidatorsSharedDefinitions,
            block: { class: "requiredTrue" }
          },
          expected: {
            requiredTrue: {
              message: "@validator-error-required-true",
              params: { actual: null, required: true }
            }
          },
        },
        {
          title: "requiredTrue - expect failure",
          args: {
            value: "somevalue", definition: formValidatorsSharedDefinitions,
            block: { class: "requiredTrue" }
          },
          expected: {
            requiredTrue: {
              message: "@validator-error-required-true",
              params: { actual: "somevalue", required: true }
            }
          },
        },
        {
          title: "requiredTrue - expect pass",
          args: {
            value: true, definition: formValidatorsSharedDefinitions,
            block: { class: "requiredTrue" }
          },
          expected: null,
        },
        {
          title: "email - expect failure",
          args: {
            value: "example.com", definition: formValidatorsSharedDefinitions,
            block: { class: "email", config: { description: "email must be in format (name)@(domain.tld)" } },
          },
          expected: {
            email: {
              message: "@validator-error-email",
              params: {
                actual: "example.com",
                description: "email must be in format (name)@(domain.tld)",
                requiredPattern: FORM_VALIDATOR_EMAIL_REGEXP
              },
            },
          },
        },
        {
          title: "email - expect pass",
          args: {
            value: "example@example.com", definition: formValidatorsSharedDefinitions,
            block: { class: "email", config: {} },
          },
          expected: null,
        },
        {
          title: "pattern - expect failure with regex",
          args: {
            value: "a", definition: formValidatorsSharedDefinitions,
            block: { class: "pattern", config: { pattern: new RegExp("prefix.*"), description: "must start with prefix" } },
          },
          expected: {
            pattern: {
              message: "@validator-error-pattern",
              params: { actual: "a", description: "must start with prefix", requiredPattern: "^prefix.*$" },
            },
          },
        },
        {
          title: "pattern - expect failure with string",
          args: {
            value: "a", definition: formValidatorsSharedDefinitions,
            block: { class: "pattern", config: { pattern: "prefix.*", description: "must start with prefix" } },
          },
          expected: {
            pattern: {
              message: "@validator-error-pattern",
              params: { actual: "a", description: "must start with prefix", requiredPattern: "^prefix.*$" },
            },
          },
        },
        {
          title: "pattern - expect pass",
          args: {
            value: "prefixa", definition: formValidatorsSharedDefinitions,
            block: { class: "pattern", config: { pattern: new RegExp("prefix.*"), description: "must start with prefix" } },
          },
          expected: null,
        },
        {
          title: "pattern - expect pass",
          args: {
            value: "prefixa", definition: formValidatorsSharedDefinitions,
            block: { class: "pattern", config: { pattern: "^prefix.*", description: "must start with prefix" } },
          },
          expected: null,
        },
        {
          title: "different-values - expect failure",
          args: {
            value: {
              item1: new SimpleServerFormValidatorControl("value"),
              item2: new SimpleServerFormValidatorControl("value"),
            },
            definition: formValidatorsSharedDefinitions,
            block: { class: "different-values", config: { controlNames: ['item1', 'item2'] } },
          },
          expected: {
            "different-values": {
              message: "@validator-error-different-values",
              params: {
                controlCount: 2,
                controlNames: ['item1', 'item2'],
                valueCount: 1,
                values: ['value']
              },
            },
          },
        },
        {
          title: "different-values - expect pass",
          args: {
            value: {
              item1: new SimpleServerFormValidatorControl("value1"),
              item2: new SimpleServerFormValidatorControl("value2"),
            },
            definition: formValidatorsSharedDefinitions,
            block: { class: "different-values", config: { controlNames: ['item1', 'item2'] } },
          },
          expected: null,
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should validate ${title}`, async () => {
        await checkValidator({ title, args, expected });
      });
    });
  });

  describe("orcid", async () => {
    const cases: {
      title: string;
      args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
      expected: FormValidatorErrors | null;
    }[] =
      [
        {
          title: "orcid - expect pass (valid with hyphens)",
          args: {
            value: "0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
        {
          title: "orcid - expect pass (valid without hyphens)",
          args: {
            value: "0000000218250097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
        {
          title: "orcid - expect pass (valid with X checksum)",
          args: {
            value: "0000-0002-1694-233X", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
        {
          title: "orcid - expect pass (valid with lowercase x checksum)",
          args: {
            value: "0000-0002-1694-233x", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
        {
          title: "orcid - expect failure (URL https)",
          args: {
            value: "https://orcid.org/0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "https://orcid.org/0000-0002-1825-0097" }
            }
          },
        },

        {
          title: "orcid - expect failure (URL www)",
          args: {
            value: "https://www.orcid.org/0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "https://www.orcid.org/0000-0002-1825-0097" }
            }
          },
        },
        {
          title: "orcid - expect failure (misplaced hyphen)",
          args: {
            value: "00000002182-50097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "00000002182-50097" }
            }
          },
        },
        {
          title: "orcid - expect failure (URL with misplaced hyphen)",
          args: {
            value: "https://www.orcid.org/00000002182-50097", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "https://www.orcid.org/00000002182-50097" }
            }
          },
        },
        {
          title: "orcid - expect failure (invalid length)",
          args: {
            value: "0000-0002-1825-009", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "0000-0002-1825-009" }
            }
          },
        },
        {
          title: "orcid - expect failure (invalid format)",
          args: {
            value: "0000-0002-1825-009A", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "0000-0002-1825-009A" }
            }
          },
        },
        {
          title: "orcid - expect failure (invalid checksum)",
          args: {
            value: "0000-0002-1825-0098", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: {
            orcid: {
              message: "@validator-error-orcid",
              params: { actual: "0000-0002-1825-0098" }
            }
          },
        },
        {
          title: "orcid - expect pass (empty)",
          args: {
            value: "", definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
        {
          title: "orcid - expect pass (null)",
          args: {
            value: null, definition: formValidatorsSharedDefinitions,
            block: { class: "orcid" },
          },
          expected: null,
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should validate ${title}`, async () => {
        await checkValidator({ title, args, expected });
      });
    });
  });

  describe("url", async () => {
    // Helper to build the expected error for the url validator, mirroring the params it emits.
    const urlError = (
      actual: unknown,
      opts: {
        schemes?: string[];
        allowAbsolute?: boolean;
        allowRelative?: boolean;
        description?: string;
      } = {},
    ): FormValidatorErrors => ({
      url: {
        message: "@validator-error-url",
        params: {
          description: opts.description ?? "",
          schemes: opts.schemes ?? ["http", "https"],
          allowAbsolute: opts.allowAbsolute ?? true,
          allowRelative: opts.allowRelative ?? false,
          actual,
        },
      },
    });

    const cases: TestCase[] =
      [
        {
          title: "url - expect pass (absolute https)",
          args: {
            value: "https://example.org/path?q=1#frag", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect pass (absolute http)",
          args: {
            value: "http://example.org", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect pass (trims surrounding whitespace)",
          args: {
            value: "  https://example.org  ", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect pass (empty)",
          args: {
            value: "", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect pass (null)",
          args: {
            value: null, definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect pass (whitespace only treated as empty)",
          args: {
            value: "   ", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: null,
        },
        {
          title: "url - expect failure (not a url)",
          args: {
            value: "not a url", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { description: "an absolute http(s) URL" } },
          },
          expected: urlError("not a url", { description: "an absolute http(s) URL" }),
        },
        {
          title: "url - expect failure (disallowed scheme)",
          args: {
            value: "ftp://example.org/file", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: urlError("ftp://example.org/file"),
        },
        {
          title: "url - expect failure (javascript scheme)",
          args: {
            value: "javascript:alert(1)", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: urlError("javascript:alert(1)"),
        },
        {
          title: "url - expect pass (custom scheme allowed)",
          args: {
            value: "ftp://example.org/file", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { schemes: ["ftp"] } },
          },
          expected: null,
        },
        {
          title: "url - expect failure (relative not allowed by default)",
          args: {
            value: "/path/to/page", definition: formValidatorsSharedDefinitions,
            block: { class: "url" },
          },
          expected: urlError("/path/to/page"),
        },
        {
          title: "url - expect pass (relative allowed)",
          args: {
            value: "/path/to/page?q=1", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { allowRelative: true } },
          },
          expected: null,
        },
        {
          title: "url - expect pass (relative allowed, absolute still allowed)",
          args: {
            value: "https://example.org", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { allowRelative: true } },
          },
          expected: null,
        },
        {
          title: "url - expect failure (protocol-relative rejected even when relative allowed)",
          args: {
            value: "//evil.example.org/x", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { allowRelative: true } },
          },
          expected: urlError("//evil.example.org/x", { allowRelative: true }),
        },
        {
          title: "url - expect failure (absolute rejected when only relative allowed)",
          args: {
            value: "https://example.org", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { allowAbsolute: false, allowRelative: true } },
          },
          expected: urlError("https://example.org", { allowAbsolute: false, allowRelative: true }),
        },
        {
          title: "url - expect failure (requireTld rejects host without a dot)",
          args: {
            value: "http://localhost:3000/x", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { requireTld: true } },
          },
          expected: urlError("http://localhost:3000/x"),
        },
        {
          title: "url - expect pass (requireTld accepts host with a dot)",
          args: {
            value: "http://example.org/x", definition: formValidatorsSharedDefinitions,
            block: { class: "url", config: { requireTld: true } },
          },
          expected: null,
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should validate ${title}`, async () => {
        await checkValidator({ title, args, expected });
      });
    });
  });

  describe("jsonata-expression", async () => {
    const expression = "$ = 45";
    async function jsonataEvaluateCustomFunc(value: unknown) {
      const compiled = jsonataCompile(expression);
      return await jsonataEvaluate(compiled, value);
    }
    const cases: {
      title: string;
      args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
      expected: FormValidatorErrors | null;
    }[] =
      [
        {
          title: "jsonata-expression - expect pass",
          args: {
            value: 45,
            definition: formValidatorsSharedDefinitions,
            block: {
              class: "jsonata-expression",
              config: { description: "the description", expression: expression, evaluator: jsonataEvaluateCustomFunc }
            },
          },
          expected: null,
        },
        {
          title: "jsonata-expression - expect pass",
          args: {
            value: 46,
            definition: formValidatorsSharedDefinitions,
            block: {
              class: "jsonata-expression",
              config: { description: "the description", expression: expression, evaluator: jsonataEvaluateCustomFunc }
            },
          },
          expected: {
            "jsonata-expression": {
              message: "@validator-error-jsonata-expression",
              params: {
                actual: 46,
                description: "the description",
                expression: expression,
              },
            },
          },
        },
        {
          title: "jsonata-expression - expect failure",
          args: {
            value: "asdasd",
            definition: formValidatorsSharedDefinitions,
            block: {
              class: "jsonata-expression",
              config: { description: "the description", expression: "$sum(2, 4)", evaluator: null }
            },
          },
          expected: {
            "jsonata-expression": {
              message: "@validator-error-jsonata-expression",
              params: {
                actual: "asdasd",
                description: "the description",
                expression: "$sum(2, 4)"
              },
            },
          },
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should validate ${title}`, async () => {
        await checkValidator({ title, args, expected });
      });
    });
  });

  describe("required anyOfFields", async () => {
    const cases: {
      title: string;
      args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
      expected: FormValidatorErrors | null;
    }[] = [
        {
          title: "required anyOfFields - expect failure for default permission row",
          args: {
            value: [{ role: "View" }],
            definition: formValidatorsSharedDefinitions,
            block: {
              class: "required",
              config: { anyOfFields: ["name", "email", "username", "orcid"] },
            },
          },
          expected: {
            required: {
              message: "@validator-error-required",
              params: {
                required: true,
                actual: [{ role: "View" }],
              },
            },
          },
        },
        {
          title: "required anyOfFields - expect pass when contributor identity exists",
          args: {
            value: [{ role: "View", name: "Daniel Nguyen" }],
            definition: formValidatorsSharedDefinitions,
            block: {
              class: "required",
              config: { anyOfFields: ["name", "email", "username", "orcid"] },
            },
          },
          expected: null,
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should validate ${title}`, async () => {
        await checkValidator({ title, args, expected });
      });
    });
  });

  describe("is enabled", async () => {
    const defaultGroups: FormValidationGroups = {
      all: {
        description: "Validate all fields with validators.",
        initialMembership: "all"
      },
      none: {
        description: "Validate none of the fields.",
        initialMembership: "none",
      },
    }
    const cases: {
      title: string;
      args: { availableGroups: FormValidationGroups, enabledGroups: string[], validators: FormValidatorConfig[] };
      expected: boolean[];
    }[] =
      [
        {
          title: "enable validator with no group when enabledGroups is empty array",
          args: {
            availableGroups: { ...defaultGroups },
            enabledGroups: [],
            validators: [{ class: 'required' }],
          },
          expected: [true]
        },
        {
          title: "enable validator when enabledGroups is 'all'",
          args: {
            availableGroups: { ...defaultGroups },
            enabledGroups: ["all"],
            validators: [{ class: 'required' }],
          },
          expected: [true]
        },
        {
          title: "disable validator when enabledGroups is 'none'",
          args: {
            availableGroups: { ...defaultGroups },
            enabledGroups: ["none"],
            validators: [{ class: 'required' }],
          },
          expected: [false]
        },
        {
          title: "enable validator when one enabled group includes it and one enabled group excludes it",
          args: {
            availableGroups: {
              ...defaultGroups,
              "include-validator": { description: "", initialMembership: "none" },
              "exclude-validator": { description: "", initialMembership: "none" },
            },
            enabledGroups: ["include-validator", "exclude-validator"],
            validators: [{ class: 'required', groups: { include: ["include-validator"], exclude: ["exclude-validator"] } }],
          },
          expected: [true]
        },
        {
          title: "complex set of enabled and disabled groups and validator included and excluded groups",
          args: {
            availableGroups: {
              ...defaultGroups,
              "validator1": { description: "", initialMembership: "none" },
              "validator2": { description: "", initialMembership: "all" },
            },
            enabledGroups: ["none", "validator2"],
            validators: [
              { class: 'required', groups: { include: ["validator1"] } },
              { class: 'required', groups: { exclude: ["validator2"] } },
            ],
          },
          expected: [
            // First validator is included by validator2 initial all
            true,
            // Second validator is not included in any group
            false,
          ],
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should ${title}`, async function () {
        const results = args.validators.map(validator =>
          new ValidatorsSupport().isValidatorEnabled(args.availableGroups, args.enabledGroups, validator)
        );
        expect(results).to.eql(expected);
      });
    });

    it(`should filter validators to only enabled validators`, async function () {
      const availableGroups: FormValidationGroups = {
        "one": { description: "", initialMembership: "all" },
        "two": { description: "", initialMembership: "all" },
        "three": { description: "", initialMembership: "none" },
      };
      const enabledGroups: string[] = ["one", "three"];
      const validators: FormValidatorConfig[] = [
        { class: "required" },
        { class: "required", groups: { include: ["three"], exclude: ["one", "two"] } },
        { class: "required", groups: { exclude: ["one"] } },
        { class: "required", groups: { exclude: ["one", "two"] } },
      ];
      const result = new ValidatorsSupport().enabledValidators(availableGroups, enabledGroups, validators);
      expect(result).to.eql([
        { class: "required" },
        { class: "required", groups: { include: ["three"], exclude: ["one", "two"] } },
      ]);
    });
  });


  describe("check validation groups", async () => {
    it(`should error when an enabled group is not in the available groups`, async function () {
      const func = () => {
        new ValidatorsSupport().checkValidationGroups({}, ["not-a-group"]);
      }
      expect(func).throws(`Unknown enabled validation groups ["not-a-group"].`);
    });
    it(`should pass when an enabled group is in the available groups`, async function () {
      new ValidatorsSupport().checkValidationGroups({ "a-group": { description: "", initialMembership: "all" } }, ["a-group"]);
    });
  });

  describe("duplicate validator classes on one control", async () => {
    // Mimic how Angular's Validators.compose merges validator results: a shallow spread
    // keyed by the returned object's keys. Distinct keys must survive the merge.
    function mergeAngularStyle(results: (FormValidatorErrors | null)[]): FormValidatorErrors {
      return results.reduce<FormValidatorErrors>((acc, res) => ({ ...acc, ...(res ?? {}) }), {});
    }

    it(`keeps a single validator's error key equal to its class (unchanged shape)`, async function () {
      const fns = vs.createFormValidatorInstancesFromMapping(
        vs.createValidatorDefinitionMapping(formValidatorsSharedDefinitions),
        [{ class: "pattern", config: { pattern: "^prefix.*$", description: "must start with prefix" } }],
      );
      const result = fns.syncDefs[0](new SimpleServerFormValidatorControl("nope"));
      // Keyed by class, with no extra 'class' field on the value.
      expect(result).to.eql({
        pattern: {
          message: "@validator-error-pattern",
          params: { actual: "nope", description: "must start with prefix", requiredPattern: "^prefix.*$" },
        },
      });
    });

    it(`gives two sync validators of the same class distinct error keys that both survive merging`, async function () {
      const fns = vs.createFormValidatorInstancesFromMapping(
        vs.createValidatorDefinitionMapping(formValidatorsSharedDefinitions),
        [
          { class: "pattern", message: "@must-start-with-prefix", config: { pattern: "^prefix.*$", description: "must start with prefix" } },
          { class: "pattern", message: "@must-end-with-suffix", config: { pattern: ".*suffix$", description: "must end with suffix" } },
        ],
      );
      const control = new SimpleServerFormValidatorControl("nope");
      const merged = mergeAngularStyle(fns.syncDefs.map(fn => fn(control)));

      // Both validators kept their own entry (no collision).
      expect(Object.keys(merged).sort()).to.eql(["pattern#0", "pattern#1"]);

      // The real class is recovered for both when flattened for display.
      const componentErrors = vs.getFormValidatorComponentErrors(merged);
      expect(componentErrors.map(e => e.class)).to.eql(["pattern", "pattern"]);
      expect(componentErrors.map(e => e.message).sort()).to.eql(["@must-end-with-suffix", "@must-start-with-prefix"]);
    });

    it(`gives two async validators of the same class distinct error keys that both survive merging`, async function () {
      const expression = "$ = 45";
      async function evaluator(value: unknown) {
        return await jsonataEvaluate(jsonataCompile(expression), value);
      }
      const fns = vs.createFormValidatorInstancesFromMapping(
        vs.createValidatorDefinitionMapping(formValidatorsSharedDefinitions),
        [
          { class: "jsonata-expression", message: "@first", config: { description: "first", expression, evaluator } },
          { class: "jsonata-expression", message: "@second", config: { description: "second", expression, evaluator } },
        ],
      );
      const control = new SimpleServerFormValidatorControl(46); // fails both
      const merged = mergeAngularStyle(await Promise.all(fns.asyncDefs.map(fn => fn(control))));

      expect(Object.keys(merged).sort()).to.eql(["jsonata-expression#0", "jsonata-expression#1"]);

      const componentErrors = vs.getFormValidatorComponentErrors(merged);
      expect(componentErrors.map(e => e.class)).to.eql(["jsonata-expression", "jsonata-expression"]);
      expect(componentErrors.map(e => e.message).sort()).to.eql(["@first", "@second"]);
    });
  });
});
