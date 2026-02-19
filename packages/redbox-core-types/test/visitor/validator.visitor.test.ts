import {cloneDeep as _cloneDeep} from "lodash";
import {
  ConstructFormConfigVisitor,
  FormConfigFrame,
  formValidatorsSharedDefinitions,
  FormValidatorSummaryErrors
} from "@researchdatabox/sails-ng-common";
import {ValidatorFormConfigVisitor} from "../../src/visitor/validator.visitor";
import {logger} from "../unit/helpers";
import {
  formConfigExample1,
  reusableFormDefinitionsExample1
} from "@researchdatabox/sails-ng-common/dist/test/unit/example-data";



let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validator Visitor", async () => {
    it(`should run only expected validators for initial membership none`, async function () {
        const formConfig: FormConfigFrame = {
            name: "default-1.0-draft",
            validationGroups: {
                minimumCreate: {
                    description: "Fields that must be valid to create a new record.",
                    initialMembership: "none",
                },
                minimumUpdate: {
                    description: "Fields that must be valid to update a new record.",
                    initialMembership: "none",
                },
            },
            componentDefinitions: [
                {
                    name: 'text_7',
                    layout: {
                        class: 'DefaultLayout',
                        config: {
                            label: 'TextField with default wrapper defined',
                            helpText: 'This is a help text',
                        }
                    },
                    model: {
                        class: 'SimpleInputModel',
                        config: {
                            defaultValue: 'hello world 2!',
                            validators: [
                                {
                                    class: 'pattern',
                                    config: {
                                        pattern: /prefix.*/,
                                        description: "must start with prefix"
                                    },
                                    groups: {include: ["minimumCreate", "minimumUpdate"]},
                                },
                                {
                                    class: 'minLength',
                                    message: "@validator-error-custom-text_7",
                                    config: {minLength: 3},
                                    groups: {include: ["minimumCreate"]},
                                },
                            ]
                        }
                    },
                    component: {
                        class: 'SimpleInputComponent'
                    }
                },
            ]
        };
        const expected: FormValidatorSummaryErrors[] = [
            {
                errors: [
                    {
                        message: "@validator-error-pattern",
                        class: "pattern",
                        params: {
                            actual: "hello world 2!",
                            description: "must start with prefix",
                            requiredPattern: "/prefix.*/",
                        },
                    },
                ],
                id: "text_7",
                message: "TextField with default wrapper defined",
                lineagePaths: {
                    formConfig: ["componentDefinitions", "0"],
                    dataModel: ["text_7"],
                    angularComponents: ["text_7"],
                    angularComponentsJsonPointer: "/text_7",
                },
            }
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({data: formConfig, formMode: "edit"});

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["minimumCreate", "minimumUpdate"],
            validatorDefinitions: formValidatorsSharedDefinitions
        });
        expect(actual).to.eql(expected);
    });
    it(`should run only expected validators for initial membership all`, async function () {
        const formConfig: FormConfigFrame = {
            name: "default-1.0-draft",
            validationGroups: {
                minimumCreate: {
                    description: "Fields that must be valid to create a new record.",
                    initialMembership: "none",
                },
                transitionDraftToSubmitted: {
                    description: "Fields that must be valid to transition from draft to submitted.",
                    initialMembership: "all",
                },
            },
            componentDefinitions: [
                {
                    name: 'text_7',
                    layout: {
                        class: 'DefaultLayout',
                        config: {
                            label: 'TextField with default wrapper defined',
                            helpText: 'This is a help text',
                        }
                    },
                    model: {
                        class: 'SimpleInputModel',
                        config: {
                            defaultValue: 'hello world 2!',
                            validators: [
                                {
                                    class: 'pattern',
                                    config: {
                                        pattern: /prefix.*/,
                                        description: "must start with prefix"
                                    },
                                    groups: {include: ['minimumCreate']},
                                },
                                {
                                    class: 'minLength',
                                    message: "@validator-error-custom-text_7",
                                    config: {minLength: 100}
                                },
                            ]
                        }
                    },
                    component: {
                        class: 'SimpleInputComponent'
                    }
                },
            ]
        };
        const expected: FormValidatorSummaryErrors[] = [
            {
                errors: [
                    {
                        message: "@validator-error-pattern",
                        class: "pattern",
                        params: {
                            actual: "hello world 2!",
                            description: "must start with prefix",
                            requiredPattern: "/prefix.*/",
                        },
                    },
                    {
                        message: "@validator-error-custom-text_7",
                        class: "minLength",
                        params: {
                            actualLength: 14,
                            requiredLength: 100,
                        },
                    },
                ],
                id: "text_7",
                message: "TextField with default wrapper defined",
                lineagePaths: {
                    formConfig: ["componentDefinitions", "0"],
                    dataModel: ["text_7"],
                    angularComponents: ["text_7"],
                    angularComponentsJsonPointer: "/text_7",
                },
            }
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({data: formConfig, formMode: "edit"});

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["transitionDraftToSubmitted"],
            validatorDefinitions: formValidatorsSharedDefinitions
        });
        expect(actual).to.eql(expected);
    });
    it(`should run expected validators for existing record`, async function () {
        const formConfig: FormConfigFrame = {
            name: "default-1.0-draft",
            componentDefinitions: [
                {
                    name: 'text_7',
                    layout: {
                        class: 'DefaultLayout',
                        config: {
                            label: 'TextField with default wrapper defined',
                            helpText: 'This is a help text',
                        }
                    },
                    model: {
                        class: 'SimpleInputModel',
                        config: {
                            defaultValue: 'hello world 2!',
                            validators: [
                                {
                                    class: 'pattern',
                                    config: {
                                        pattern: /prefix.*/,
                                        description: "must start with prefix"
                                    },
                                },
                                {
                                    class: 'minLength',
                                    message: "@validator-error-custom-text_7",
                                    config: {minLength: 100}
                                },
                            ]
                        }
                    },
                    component: {
                        class: 'SimpleInputComponent'
                    }
                },
            ]
        };
        const record = {
            text_7: "prefix"
        };
        const expected: FormValidatorSummaryErrors[] = [
            {
                errors: [
                    {
                        message: "@validator-error-custom-text_7",
                        class: "minLength",
                        params: {
                            actualLength: 6,
                            requiredLength: 100,
                        },
                    },
                ],
                id: "text_7",
                message: "TextField with default wrapper defined",
                lineagePaths: {
                    formConfig: ["componentDefinitions", "0"],
                    dataModel: ["text_7"],
                    angularComponents: ["text_7"],
                    angularComponentsJsonPointer: "/text_7",
                },
            }
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({data: formConfig, formMode: "edit", record});

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["all"],
            validatorDefinitions: formValidatorsSharedDefinitions,
        });
        expect(actual).to.eql(expected);
    });
    it(`should run all the validators in example form config with empty existing record`, async function () {
        const args = _cloneDeep(formConfigExample1);
        const record = {};
        const expected: FormValidatorSummaryErrors[] = [
            {
                "errors": [
                    {
                        "message": "@validator-error-required",
                        "class": "required",
                        "params": {"actual": undefined, "required": true}
                    }
                ],
                "id": "text_1_event",
                "message": null,
                lineagePaths: {
                    "formConfig": [
                        "componentDefinitions",
                        "0",
                        "component",
                        "config",
                        "tabs",
                        "0",
                        "component",
                        "config",
                        "componentDefinitions",
                        "8",
                    ],
                    "dataModel": ["text_1_event"],
                    "angularComponents": ["main_tab", "tab_1", "text_1_event"],
                    "angularComponentsJsonPointer": "/main_tab/tab_1/text_1_event",
                },
            },
            {
                "errors": [
                    {
                        "message": "@validator-error-required",
                        "class": "required",
                        "params": {"actual": undefined, "required": true},
                    }
                ],
                "id": "text_2_event",
                "message": null,
                lineagePaths: {
                    formConfig: [
                        "componentDefinitions",
                        "0",
                        "component",
                        "config",
                        "tabs",
                        "0",
                        "component",
                        "config",
                        "componentDefinitions",
                        "11",
                    ],
                    dataModel: ["text_2_event"],
                    angularComponents: ["main_tab", "tab_1", "text_2_event"],
                    angularComponentsJsonPointer: "/main_tab/tab_1/text_2_event",
                },
            },
            {
                "errors": [
                    {
                        "message": "@validator-error-required",
                        "class": "required",
                        "params": {"actual": undefined, "required": true}
                    }
                ],
                "id": "text_3_event",
                "message": null,
                lineagePaths: {
                    formConfig: [
                        "componentDefinitions",
                        "0",
                        "component",
                        "config",
                        "tabs",
                        "0",
                        "component",
                        "config",
                        "componentDefinitions",
                        "13",
                    ],
                    dataModel: ["text_3_event"],
                    angularComponents: ["main_tab", "tab_1", "text_3_event"],
                    angularComponentsJsonPointer: "/main_tab/tab_1/text_3_event",
                },
            },
            {
                "errors": [
                    {
                        "message": "@validator-error-required",
                        "class": "required",
                        "params": {"actual": undefined, "required": true}
                    }
                ],
                "id": "text_5",
                "message": "TextField with default wrapper defined",
                lineagePaths: {
                    formConfig: [
                        "componentDefinitions",
                        "0",
                        "component",
                        "config",
                        "tabs",
                        "1",
                        "component",
                        "config",
                        "componentDefinitions",
                        "0",
                        "component",
                        "config",
                        "componentDefinitions",
                        "2",
                        "component",
                        "config",
                        "componentDefinitions",
                        "0",
                    ],
                    dataModel: ["group_1_component", "group_2_component", "text_5"],
                    angularComponents: ["main_tab", "tab_2", "group_1_component", "group_2_component", "text_5"],
                    angularComponentsJsonPointer: "/main_tab/tab_2/group_1_component/group_2_component/text_5"
                },
            },
            {
                "errors": [
                    {
                        "class": "different-values",
                        "message": "@validator-error-different-values",
                        "params": {
                            "controlCount": 2,
                            "controlNames": ["text_1_event", "text_2"],
                            "valueCount": 1,
                            "values": [undefined],
                        }
                    }
                ],
                "id": "default-1.0-draft",
                "message": null,
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: [], angularComponentsJsonPointer: ""},
            },
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({data: args, formMode: "edit", record, reusableFormDefs: reusableFormDefinitionsExample1,});

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["all"],
            validatorDefinitions: formValidatorsSharedDefinitions,
        });
        expect(actual).to.eql(expected);
    });

    it("should report typeahead configuration errors for unsupported/invalid config", async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            data: {
                name: "typeahead-validator",
                componentDefinitions: [
                    {
                        name: "lookup",
                        component: {
                            class: "TypeaheadInputComponent",
                            config: {
                                sourceType: "namedQuery",
                                multiSelect: true
                            }
                        },
                        model: {class: "TypeaheadInputModel", config: {defaultValue: null}}
                    }
                ]
            },
            formMode: "edit"
        });

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["all"],
            validatorDefinitions: formValidatorsSharedDefinitions
        });
        const classNames = actual.flatMap((entry) => entry.errors.map((err) => err.class));
        expect(classNames).to.contain("typeaheadQueryId");
        expect(classNames).to.contain("typeaheadMultiSelect");
    });
});
