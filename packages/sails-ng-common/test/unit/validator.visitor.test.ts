import {cloneDeep as _cloneDeep} from "lodash";
import {
    ConstructFormConfigVisitor,
    FormConfigFrame,
    formValidatorsSharedDefinitions,
    FormValidatorSummaryErrors
} from "../../src";
import {ValidatorFormConfigVisitor} from "../../src";
import {logger} from "./helpers";
import {formConfigExample1} from "./example-data";


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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
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
                lineagePaths: {formConfig: [],
                    dataModel: ["group_1_component", "group_2_component"],
                    angularComponents: ["group_1_component", "group_2_component"]
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
                lineagePaths: {formConfig: [], dataModel: [], angularComponents: []},
            },
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({data: args, formMode: "edit", record});

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            enabledValidationGroups: ["all"],
            validatorDefinitions: formValidatorsSharedDefinitions,
        });
        expect(actual).to.eql(expected);
    });
});
