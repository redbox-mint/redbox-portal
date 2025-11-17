import {
    FormValidatorConfig,
    FormValidatorDefinition,
    FormValidatorErrors,
    SimpleServerFormValidatorControl,
    FORM_VALIDATOR_EMAIL_REGEXP,
    formValidatorsSharedDefinitions,
    ValidatorsSupport
} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validators", async () => {
    const cases: {
        title: string;
        args: { value: unknown; definition: FormValidatorDefinition[]; block: FormValidatorConfig };
        expected: FormValidatorErrors | null;
    }[] = [
        {
            title: "min - expect failure",
            args: {
                value: 2, definition: formValidatorsSharedDefinitions,
                block: {name: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
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
                block: {name: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
            },
            expected: null,
        },
        {
            title: "min - expect pass",
            args: {
                value: 4, definition: formValidatorsSharedDefinitions,
                block: {name: "min", message: "@validator-error-custom-text_2", config: {min: 3}},
            },
            expected: null,
        },
        {
            title: "max - expect failure",
            args: {
                value: 6, definition: formValidatorsSharedDefinitions,
                block: {name: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
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
                block: {name: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
            },
            expected: null,
        },
        {
            title: "max - expect pass",
            args: {
                value: 2, definition: formValidatorsSharedDefinitions,
                block: {name: "max", message: "@validator-error-custom-text_2", config: {max: 3}},
            },
            expected: null,
        },
        {
            title: "minLength - expect failure",
            args: {
                value: "b", definition: formValidatorsSharedDefinitions,
                block: {name: "minLength", message: "@validator-error-custom-text_2", config: {minLength: 3}},
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
                block: {name: "minLength", message: "@validator-error-custom-text_2", config: {minLength: 3}},
            },
            expected: null,
        },
        {
            title: "maxLength - expect failure",
            args: {
                value: "bbbb", definition: formValidatorsSharedDefinitions,
                block: {name: "maxLength", config: {maxLength: 3}},
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
                block: {name: "maxLength", config: {maxLength: 3}},
            },
            expected: null,
        },
        {
            title: "required - expect failure",
            args: {
                value: null, definition: formValidatorsSharedDefinitions,
                block: {name: "required"}
            },
            expected: {required: {message: "@validator-error-required", params: {actual: null, required: true}}},
        },
        {
            title: "required - expect pass",
            args: {
                value: null, definition: formValidatorsSharedDefinitions,
                block: {name: "required"}
            },
            expected: {required: {message: "@validator-error-required", params: {actual: null, required: true}}},
        },
        {
            title: "requiredTrue - expect failure",
            args: {
                value: null, definition: formValidatorsSharedDefinitions,
                block: {name: "requiredTrue"}
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
                block: {name: "requiredTrue"}
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
                block: {name: "requiredTrue"}
            },
            expected: null,
        },
        {
            title: "email - expect failure",
            args: {
                value: "example.com", definition: formValidatorsSharedDefinitions,
                block: {name: "email", config: {description: "email must be in format (name)@(domain.tld)"}},
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
                block: {name: "email", config: {}},
            },
            expected: null,
        },
        {
            title: "pattern - expect failure",
            args: {
                value: "a", definition: formValidatorsSharedDefinitions,
                block: {name: "pattern", config: {pattern: /prefix.*/, description: "must start with prefix"}},
            },
            expected: {
                pattern: {
                    message: "@validator-error-pattern",
                    params: {actual: "a", description: "must start with prefix", requiredPattern: "/prefix.*/"},
                },
            },
        },
        {
            title: "pattern - expect pass",
            args: {
                value: "prefixa", definition: formValidatorsSharedDefinitions,
                block: {name: "pattern", config: {pattern: /prefix.*/, description: "must start with prefix"}},
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
                block: {name: "different-values", config: {controlNames: ['item1', 'item2']}},
            },
            expected: {
                "different-values": {
                    message: "@validator-error-different-values",
                    params: {controlCount: 2, controlNames: ['item1', 'item2'], valueCount: 1, values: ['value']},
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
                block: {name: "different-values", config: {controlNames: ['item1', 'item2']}},
            },
            expected: null,
        },
        {
            title: "jsonata-expression - expect failure",
            args: {
                value: "asdasd",
                definition: formValidatorsSharedDefinitions,
                block: {
                    name: "jsonata-expression",
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
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should validate ${title}`, async function () {
            const fns = new ValidatorsSupport().createFormValidatorInstances(args.definition, [args.block]);
            expect(fns).to.have.length(1);
            expect(fns[0](new SimpleServerFormValidatorControl(args.value))).to.eql(expected);
        });
    });
});
