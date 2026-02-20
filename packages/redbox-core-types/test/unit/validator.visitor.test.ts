import { cloneDeep as _cloneDeep } from "lodash";
import {
    FormConfigFrame,
    formValidatorsSharedDefinitions,
    FormValidatorSummaryErrors
} from "@researchdatabox/sails-ng-common";
import { ConstructFormConfigVisitor, ValidatorFormConfigVisitor } from "../../src";
import { logger } from "./helpers";
import Services from "../../src/services/DomSanitizerService";
import * as _ from "lodash";
import { reusableFormDefinitions } from "../../src";
import {formConfigExample1} from "./example-data";

const DomSanitizerService = new Services.DomSanitizer();

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validator Visitor", async () => {
    before(() => {
        (global as any)._ = _;
        (global as any).DomSanitizerService = DomSanitizerService;
        (globalThis as any).DomSanitizerService = DomSanitizerService;
    });
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
                                    groups: { include: ["minimumCreate", "minimumUpdate"] },
                                },
                                {
                                    class: 'minLength',
                                    message: "@validator-error-custom-text_7",
                                    config: { minLength: 3 },
                                    groups: { include: ["minimumCreate"] },
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
        const constructed = constructor.start({ data: formConfig, formMode: "edit" });

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
                                    groups: { include: ['minimumCreate'] },
                                },
                                {
                                    class: 'minLength',
                                    message: "@validator-error-custom-text_7",
                                    config: { minLength: 100 }
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
        const constructed = constructor.start({ data: formConfig, formMode: "edit" });

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
                                    config: { minLength: 100 }
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
        const constructed = constructor.start({ data: formConfig, formMode: "edit", record });

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
                        "params": { "actual": undefined, "required": true }
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
                        "params": { "actual": undefined, "required": true },
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
                        "params": { "actual": undefined, "required": true }
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
                        "params": { "actual": undefined, "required": true }
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
                lineagePaths: { formConfig: [], dataModel: [], angularComponents: [], angularComponentsJsonPointer: "" },
            },
        ];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
          data: args, formMode: "edit", record, reusableFormDefs: reusableFormDefinitions
        });

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
                        model: { class: "TypeaheadInputModel", config: { defaultValue: null } }
                    }
                ]
            },
            formMode: "edit",
            reusableFormDefs: reusableFormDefinitions,
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

    describe("HTML Sanitization", () => {
        const dirtyHtml = '<p>Safe</p><script>alert("xss")</script><img src="x" onerror="alert(1)">';
        const cleanHtml = '<p>Safe</p><img src="x">';
        const buildSails = (mode: 'sanitize' | 'reject') => ({
            config: {
                record: { form: { htmlSanitizationMode: mode } },
                dompurify: {
                    profiles: {
                        html: { USE_PROFILES: { html: true } },
                        svg: { USE_PROFILES: { svg: true } }
                    },
                    defaultProfile: 'html'
                }
            },
            log: {
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                silly: () => {}
            }
        });

        it("should sanitize dangerous HTML in rich text model value and report warning", async function () {
            const formConfig: any = {
                name: "sanitization-test",
                componentDefinitions: [
                    {
                        name: 'rich_text',
                        layout: { class: 'DefaultLayout', config: { label: 'Rich Text' } },
                        model: {
                            class: 'RichTextEditorModel',
                            config: { defaultValue: dirtyHtml }
                        },
                        component: { class: 'RichTextEditorComponent' }
                    }
                ]
            };

            const constructor = new ConstructFormConfigVisitor(logger);
            let constructed;
            try {
                constructed = constructor.start({
                  data: formConfig, formMode: "edit",
                  reusableFormDefs: reusableFormDefinitions,
                });
            } catch (e) {
                console.error("CONSTRUCTION ERROR (1):", e);
                console.error("ERROR STACK (1):", (e as any).stack);
                throw e;
            }

            // Ensure sails.config is available for the test
            (global as any).sails = buildSails('sanitize');
            (globalThis as any).sails = (global as any).sails;

            const visitor = new ValidatorFormConfigVisitor(logger);
            const actual = visitor.start({
                form: constructed,
                enabledValidationGroups: ["all"],
                validatorDefinitions: formValidatorsSharedDefinitions
            });

            const richTextField = constructed.componentDefinitions[0] as any;
            expect(richTextField.model.config.value).to.not.contain('<script>');
            expect(richTextField.model.config.value).to.not.contain('onerror');
            expect(richTextField.model.config.value).to.contain('<p>Safe</p>');

            expect(actual).to.have.length(1);
            expect(actual[0].errors[0].class).to.equal('htmlSanitized');
        });

        it("should reject dirty HTML when mode is 'reject'", async function () {
            const formConfig: any = {
                name: "sanitization-test-reject",
                componentDefinitions: [
                    {
                        name: 'rich_text',
                        layout: { class: 'DefaultLayout', config: { label: 'Rich Text' } },
                        model: {
                            class: 'RichTextEditorModel',
                            config: { defaultValue: dirtyHtml }
                        },
                        component: { class: 'RichTextEditorComponent' }
                    }
                ]
            };

            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start({
              data: formConfig, formMode: "edit",
              reusableFormDefs: reusableFormDefinitions,
            });

            // Set mode to reject
            (global as any).sails = buildSails('reject');
            (globalThis as any).sails = (global as any).sails;

            const visitor = new ValidatorFormConfigVisitor(logger);
            const actual = visitor.start({
                form: constructed,
                enabledValidationGroups: ["all"],
                validatorDefinitions: formValidatorsSharedDefinitions
            });

            const richTextField = constructed.componentDefinitions[0] as any;
            // Value should NOT be mutated
            expect(richTextField.model.config.value).to.equal(dirtyHtml);

            expect(actual).to.have.length(1);
            expect(actual[0].errors[0].class).to.equal('htmlUnsafe');
        });

        it("should not report when content is already clean", async function () {
            const formConfig: any = {
                name: "sanitization-test-clean",
                componentDefinitions: [
                    {
                        name: 'rich_text',
                        layout: { class: 'DefaultLayout', config: { label: 'Rich Text' } },
                        model: {
                            class: 'RichTextEditorModel',
                            config: { defaultValue: cleanHtml }
                        },
                        component: { class: 'RichTextEditorComponent' }
                    }
                ]
            };

            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start({
              data: formConfig, formMode: "edit",
              reusableFormDefs: reusableFormDefinitions,
            });

            (global as any).sails = buildSails('sanitize');
            (globalThis as any).sails = (global as any).sails;

            const visitor = new ValidatorFormConfigVisitor(logger);
            const actual = visitor.start({
                form: constructed,
                enabledValidationGroups: ["all"],
                validatorDefinitions: formValidatorsSharedDefinitions
            });

            expect(actual).to.have.length(0);
        });
    });
});
