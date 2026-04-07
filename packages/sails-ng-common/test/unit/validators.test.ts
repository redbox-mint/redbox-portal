import {
    FormValidatorConfig,
    FormValidatorDefinition,
    FormValidatorErrors,
    SimpleServerFormValidatorControl,
    FORM_VALIDATOR_EMAIL_REGEXP,
    formValidatorsSharedDefinitions,
    ValidatorsSupport, FormValidationGroups
} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validator", async () => {
    describe("definitions", async () => {
        const cases: {
            title: string;
            args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
            expected: FormValidatorErrors | null;
        }[] =
            [
                {
                    title: "min - expect failure",
                    args: {
                        value: 2, definition: formValidatorsSharedDefinitions,
                        block: {class: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
                    },
                    expected: {
                        min: {
                            message: "@validator-error-custom-text_2",
                            params: {actual: 2, requiredThreshold: 3}
                        }
                    },
                },
                {
                    title: "min - expect pass",
                    // (note, it looks like the HTML WHATWG spec treats a value that cannot be converted to a number as not having a minimum)
                    args: {
                        value: "aa", definition: formValidatorsSharedDefinitions,
                        block: {class: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
                    },
                    expected: null,
                },
                {
                    title: "min - expect pass",
                    args: {
                        value: 4, definition: formValidatorsSharedDefinitions,
                        block: {class: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
                    },
                    expected: null,
                },
                {
                    title: "max - expect failure",
                    args: {
                        value: 6, definition: formValidatorsSharedDefinitions,
                        block: {class: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
                    },
                    expected: {
                        max: {
                            message: "@validator-error-custom-text_2",
                            params: {actual: 6, requiredThreshold: 3}
                        }
                    },
                },
                {
                    title: "max - expect pass",
                    args: {
                        value: "aaa", definition: formValidatorsSharedDefinitions,
                        block: {class: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
                    },
                    expected: null,
                },
                {
                    title: "max - expect pass",
                    args: {
                        value: 2, definition: formValidatorsSharedDefinitions,
                        block: {class: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
                    },
                    expected: null,
                },
                {
                    title: "minLength - expect failure",
                    args: {
                        value: "b", definition: formValidatorsSharedDefinitions,
                        block: {class: "minLength", message: "@validator-error-custom-text_2", config: {minLength: 3}},
                    },
                    expected: {
                        minLength: {
                            message: "@validator-error-custom-text_2",
                            params: {actualLength: 1, requiredLength: 3}
                        }
                    },
                },
                {
                    title: "minLength - expect pass",
                    args: {
                        value: "bbb", definition: formValidatorsSharedDefinitions,
                        block: {class: "minLength", message: "@validator-error-custom-text_2", config: {minLength: 3}},
                    },
                    expected: null,
                },
                {
                    title: "maxLength - expect failure",
                    args: {
                        value: "bbbb", definition: formValidatorsSharedDefinitions,
                        block: {class: "maxLength", config: {maxLength: 3}},
                    },
                    expected: {
                        maxLength: {
                            message: "@validator-error-max-length",
                            params: {actualLength: 4, requiredLength: 3}
                        }
                    },
                },
                {
                    title: "maxLength - expect pass",
                    args: {
                        value: "bbb", definition: formValidatorsSharedDefinitions,
                        block: {class: "maxLength", config: {maxLength: 3}},
                    },
                    expected: null,
                },
                {
                    title: "required - expect failure",
                    args: {
                        value: null, definition: formValidatorsSharedDefinitions,
                        block: {class: "required"}
                    },
                    expected: {
                        required: {
                            message: "@validator-error-required",
                            params: {actual: null, required: true}
                        }
                    },
                },
                {
                    title: "required - expect pass",
                    args: {
                        value: null, definition: formValidatorsSharedDefinitions,
                        block: {class: "required"}
                    },
                    expected: {
                        required: {
                            message: "@validator-error-required",
                            params: {actual: null, required: true}
                        }
                    },
                },
                {
                    title: "requiredTrue - expect failure",
                    args: {
                        value: null, definition: formValidatorsSharedDefinitions,
                        block: {class: "requiredTrue"}
                    },
                    expected: {
                        requiredTrue: {
                            message: "@validator-error-required-true",
                            params: {actual: null, required: true}
                        }
                    },
                },
                {
                    title: "requiredTrue - expect failure",
                    args: {
                        value: "somevalue", definition: formValidatorsSharedDefinitions,
                        block: {class: "requiredTrue"}
                    },
                    expected: {
                        requiredTrue: {
                            message: "@validator-error-required-true",
                            params: {actual: "somevalue", required: true}
                        }
                    },
                },
                {
                    title: "requiredTrue - expect pass",
                    args: {
                        value: true, definition: formValidatorsSharedDefinitions,
                        block: {class: "requiredTrue"}
                    },
                    expected: null,
                },
                {
                    title: "email - expect failure",
                    args: {
                        value: "example.com", definition: formValidatorsSharedDefinitions,
                        block: {class: "email", config: {description: "email must be in format (name)@(domain.tld)"}},
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
                        block: {class: "email", config: {}},
                    },
                    expected: null,
                },
                {
                    title: "pattern - expect failure with regex",
                    args: {
                        value: "a", definition: formValidatorsSharedDefinitions,
                        block: {class: "pattern", config: {pattern: new RegExp("prefix.*"), description: "must start with prefix"}},
                    },
                    expected: {
                        pattern: {
                            message: "@validator-error-pattern",
                            params: {actual: "a", description: "must start with prefix", requiredPattern: "^prefix.*$"},
                        },
                    },
                },
                {
                    title: "pattern - expect failure with string",
                    args: {
                        value: "a", definition: formValidatorsSharedDefinitions,
                        block: {class: "pattern", config: {pattern: "prefix.*", description: "must start with prefix"}},
                    },
                    expected: {
                        pattern: {
                            message: "@validator-error-pattern",
                            params: {actual: "a", description: "must start with prefix", requiredPattern: "^prefix.*$"},
                        },
                    },
                },
                {
                    title: "pattern - expect pass",
                    args: {
                        value: "prefixa", definition: formValidatorsSharedDefinitions,
                        block: {class: "pattern", config: {pattern: new RegExp("prefix.*"), description: "must start with prefix"}},
                    },
                    expected: null,
                },
                {
                    title: "pattern - expect pass",
                    args: {
                        value: "prefixa", definition: formValidatorsSharedDefinitions,
                        block: {class: "pattern", config: {pattern: "^prefix.*", description: "must start with prefix"}},
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
                        block: {class: "different-values", config: {controlNames: ['item1', 'item2']}},
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
                        block: {class: "different-values", config: {controlNames: ['item1', 'item2']}},
                    },
                    expected: null,
                },
                {
                    title: "jsonata-expression - expect failure",
                    args: {
                        value: "asdasd",
                        definition: formValidatorsSharedDefinitions,
                        block: {
                            class: "jsonata-expression",
                            config: {description: "the description", expression: "$sum(2, 4)", evaluator: null}
                        },
                    },
                    expected: {
                        "jsonata-expression": {
                            message: "@validator-error-jsonata-expression",
                            params: {
                                actual: "asdasd",
                                description: "the validator is not configured correctly",
                                expression: "$sum(2, 4)"
                            },
                        },
                    },
                },
                // jsonata-expression - expression evaluation is not available in sails-ng-common
                // This is tested in the sails tests.
                {
                    title: "orcid - expect pass (valid with hyphens)",
                    args: {
                        value: "0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
                {
                    title: "orcid - expect pass (valid without hyphens)",
                    args: {
                        value: "0000000218250097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
                {
                    title: "orcid - expect pass (valid with X checksum)",
                    args: {
                        value: "0000-0002-1694-233X", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
                {
                    title: "orcid - expect pass (valid with lowercase x checksum)",
                    args: {
                        value: "0000-0002-1694-233x", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
                {
                    title: "orcid - expect failure (URL https)",
                    args: {
                        value: "https://orcid.org/0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "https://orcid.org/0000-0002-1825-0097"}
                        }
                    },
                },

                {
                    title: "orcid - expect failure (URL www)",
                    args: {
                        value: "https://www.orcid.org/0000-0002-1825-0097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "https://www.orcid.org/0000-0002-1825-0097"}
                        }
                    },
                },
                {
                    title: "orcid - expect failure (misplaced hyphen)",
                    args: {
                        value: "00000002182-50097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "00000002182-50097"}
                        }
                    },
                },
                {
                    title: "orcid - expect failure (URL with misplaced hyphen)",
                    args: {
                        value: "https://www.orcid.org/00000002182-50097", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "https://www.orcid.org/00000002182-50097"}
                        }
                    },
                },
                {
                    title: "orcid - expect failure (invalid length)",
                    args: {
                        value: "0000-0002-1825-009", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "0000-0002-1825-009"}
                        }
                    },
                },
                {
                    title: "orcid - expect failure (invalid format)",
                    args: {
                        value: "0000-0002-1825-009A", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "0000-0002-1825-009A"}
                        }
                    },
                },
                {
                    title: "orcid - expect failure (invalid checksum)",
                    args: {
                        value: "0000-0002-1825-0098", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: {
                        orcid: {
                            message: "@validator-error-orcid",
                            params: {actual: "0000-0002-1825-0098"}
                        }
                    },
                },
                {
                    title: "orcid - expect pass (empty)",
                    args: {
                        value: "", definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
                {
                    title: "orcid - expect pass (null)",
                    args: {
                        value: null, definition: formValidatorsSharedDefinitions,
                        block: {class: "orcid"},
                    },
                    expected: null,
                },
            ];
        cases.forEach(({title, args, expected}) => {
            it(`should validate ${title}`, async function () {
                const fns = new ValidatorsSupport().createFormValidatorInstances(args.definition, [args.block]);
                expect(fns).to.have.length(1);
                expect(fns[0](new SimpleServerFormValidatorControl(args.value))).to.eql(expected);
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
            availableGroups: {...defaultGroups},
            enabledGroups: [],
            validators: [{class: 'required'}],
          },
          expected: [true]
        },
        {
          title: "enable validator when enabledGroups is 'all'",
          args: {
            availableGroups: {...defaultGroups},
            enabledGroups: ["all"],
            validators: [{class: 'required'}],
          },
          expected: [true]
        },
        {
          title: "disable validator when enabledGroups is 'none'",
          args: {
            availableGroups: {...defaultGroups},
            enabledGroups: ["none"],
            validators: [{class: 'required'}],
          },
          expected: [false]
        },
        {
          title: "enable validator when one enabled group includes it and one enabled group excludes it",
          args: {
            availableGroups: {
              ...defaultGroups,
              "include-validator": {description: "", initialMembership: "none"},
              "exclude-validator": {description: "", initialMembership: "none"},
            },
            enabledGroups: ["include-validator", "exclude-validator"],
            validators: [{class: 'required', groups: {include:["include-validator"], exclude: ["exclude-validator"]}}],
          },
          expected: [true]
        },
        {
          title: "complex set of enabled and disabled groups and validator included and excluded groups",
          args: {
            availableGroups: {
              ...defaultGroups,
              "validator1": {description: "", initialMembership: "none"},
              "validator2": {description: "", initialMembership: "all"},
            },
            enabledGroups: ["none", "validator2"],
            validators: [
              {class: 'required', groups: {include:["validator1"]}},
              {class: 'required', groups: {exclude: ["validator2"]}},
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
    cases.forEach(({title, args, expected}) => {
      it(`should ${title}`, async function () {
        const results = args.validators.map(validator =>
          new ValidatorsSupport().isValidatorEnabled(args.availableGroups, args.enabledGroups, validator)
        );
        expect(results).to.eql(expected);
      });
    });

    it(`should filter validators to only enabled validators`, async function () {
      const availableGroups: FormValidationGroups = {
        "one": {description: "", initialMembership: "all"},
        "two": {description: "", initialMembership: "all"},
        "three": {description: "", initialMembership: "none"},
      };
      const enabledGroups: string[] = ["one", "three"];
      const validators: FormValidatorConfig[] = [
        {class: "required"},
        {class: "required", groups: {include: ["three"], exclude: ["one", "two"]}},
        {class: "required", groups: { exclude: ["one"]}},
        {class: "required", groups: { exclude: ["one", "two"]}},
      ];
      const result = new ValidatorsSupport().enabledValidators(availableGroups, enabledGroups, validators);
      expect(result).to.eql([
        {class: "required"},
        {class: "required", groups: {include: ["three"], exclude: ["one", "two"]}},
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
      new ValidatorsSupport().checkValidationGroups({"a-group": {description: "", initialMembership: "all"}}, ["a-group"]);
    });
  });
});
