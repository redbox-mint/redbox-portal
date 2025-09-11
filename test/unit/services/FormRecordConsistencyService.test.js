"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
let expect;
import("chai").then(mod => expect = mod.expect);
describe('The FormRecordConsistencyService', function () {
    const formConfigStandard = {
        name: "default-1.0-draft",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
            defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        skipValidationOnSave: false,
    };
    const formModelStandard = {
        workflowStep: "",
        name: "default-1.0-draft",
        type: "rdmp",
        editCssClasses: "redbox-form form",
        skipValidationOnSave: false,
        attachmentFields: undefined,
        customAngularApp: undefined,
        fields: [],
        messages: {},
        requiredFieldIndicator: "",
        viewCssClasses: ""
    };
    const formModelConfigStandard = {
        ...formConfigStandard,
        ...formModelStandard,
    };
    it('should detect changes using compareRecords', function () {
        const original = {
            name: 'my object',
            description: "it's an object!",
            details: {
                it: 'has',
                an: 'array',
                again: 'hi',
                with: ['a', 'few', 'elements'],
                hello: ['first', 'second'],
            }
        };
        const changed = {
            name: 'updated object',
            description: "it's an object!",
            details: {
                it: 'has',
                an: 'array',
                with: ['a', 'few', 'more', 'elements', { than: 'before' }],
                hello: ['first'],
            }
        };
        const expected = [
            {
                kind: "change",
                path: ['name'],
                original: 'my object',
                changed: 'updated object',
            },
            {
                kind: "delete",
                path: ['details', 'again'],
                original: 'hi',
                changed: undefined,
            },
            {
                kind: "change",
                path: ['details', 'with', 2],
                original: 'elements',
                changed: 'more',
            },
            {
                kind: 'add',
                path: ['details', 'with', 3],
                original: undefined,
                changed: 'elements',
            },
            {
                kind: 'add',
                path: ['details', 'with', 4],
                original: undefined,
                changed: { than: 'before' },
            },
            {
                kind: 'delete',
                path: ['details', 'hello', 1],
                original: 'second',
                changed: undefined,
            }
        ];
        const outcome = FormRecordConsistencyService.compareRecords(original, changed);
        expect(outcome).to.eql(expected);
    });
    describe('mergeRecord methods', function () {
        const cases = [
            {
                // no changes
                args: {
                    componentDefinitions: [
                        {
                            name: 'repeatable_group_1',
                            model: {
                                class: 'RepeatableComponentModel',
                                config: { defaultValue: [{ text_1: "hello world from repeating groups" }] }
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        model: { class: 'GroupFieldModel', config: { defaultValue: {} } },
                                        component: {
                                            class: 'GroupFieldComponent',
                                            config: {
                                                wrapperCssClasses: 'col',
                                                componentDefinitions: [
                                                    {
                                                        name: 'text_2',
                                                        model: {
                                                            class: 'SimpleInputModel',
                                                            config: { defaultValue: 'hello world 2!' }
                                                        },
                                                        component: {
                                                            class: 'SimpleInputComponent'
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                    original: {
                        redboxOid: "abcd",
                        metadata: {
                            repeatable_group_1: [
                                {
                                    text_1: "text 1 value",
                                    text_2: "text 2 value",
                                    repeatable_for_admin: [
                                        { text_for_repeatable_for_admin: "rpt value 1" },
                                        { text_for_repeatable_for_admin: "rpt value 2" }
                                    ]
                                },
                                {
                                    text_1: "text 1 value 2",
                                    text_2: "text 2 value 2",
                                    repeatable_for_admin: [
                                        { text_for_repeatable_for_admin: "rpt value 1 2" },
                                        { text_for_repeatable_for_admin: "rpt value 2 2" }
                                    ]
                                }
                            ]
                        }
                    },
                    changed: {
                        redboxOid: "abcd",
                        metadata: {
                            repeatable_group_1: [
                                {
                                    text_1: "text 1 value",
                                    text_2: "text 2 value",
                                    repeatable_for_admin: [
                                        { text_for_repeatable_for_admin: "rpt value 1" },
                                        { text_for_repeatable_for_admin: "rpt value 2" }
                                    ]
                                },
                                {
                                    text_1: "text 1 value 2",
                                    text_2: "text 2 value 2",
                                    repeatable_for_admin: [
                                        { text_for_repeatable_for_admin: "rpt value 1 2" },
                                        { text_for_repeatable_for_admin: "rpt value 2 2" }
                                    ]
                                }
                            ]
                        }
                    }
                },
                expected: {
                    redboxOid: "abcd",
                    metadata: {
                        repeatable_group_1: [
                            {
                                text_1: "text 1 value",
                                text_2: "text 2 value",
                                repeatable_for_admin: [
                                    { text_for_repeatable_for_admin: "rpt value 1" },
                                    { text_for_repeatable_for_admin: "rpt value 2" }
                                ]
                            },
                            {
                                text_1: "text 1 value 2",
                                text_2: "text 2 value 2",
                                repeatable_for_admin: [
                                    { text_for_repeatable_for_admin: "rpt value 1 2" },
                                    { text_for_repeatable_for_admin: "rpt value 2 2" }
                                ]
                            }
                        ]
                    }
                },
            },
            {
                // basic allowed and prevented changes
                args: {
                    componentDefinitions: [
                        {
                            name: 'group_1',
                            model: { class: 'GroupFieldModel', config: {} },
                            component: {
                                class: 'GroupFieldComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'text_1',
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: 'hello world 1!' }
                                            },
                                            component: { class: 'SimpleInputComponent' },
                                        },
                                        {
                                            name: 'group_2',
                                            model: { class: 'GroupFieldModel', config: {} },
                                            component: {
                                                class: 'GroupFieldComponent',
                                                config: {
                                                    componentDefinitions: [
                                                        {
                                                            name: 'text_2',
                                                            model: { class: 'SimpleInputModel', config: {} },
                                                            component: {
                                                                class: 'SimpleInputComponent'
                                                            },
                                                        },
                                                    ]
                                                }
                                            }
                                        }
                                    ]
                                }
                            },
                        },
                        {
                            name: 'repeatable_1',
                            model: {
                                class: 'RepeatableComponentModel',
                                config: { defaultValue: ["hello world from repeating groups"] }
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        model: { class: 'SimpleInputModel', config: {} },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                },
                            },
                        },
                    ],
                    original: {
                        redboxOid: "abcd",
                        metadata: {
                            group_1: {
                                text_1: 'hello world 1!',
                                group_2: { text_2: "group_1 group_2 text_2" },
                            },
                            repeatable_1: [
                                "hello world from repeating groups",
                            ]
                        }
                    },
                    changed: {
                        redboxOid: "abcd",
                        metadata: {
                            text_0: "text_0 this is not allowed, ignore it",
                            group_1: {
                                text_1: 'text_1 new value',
                                text_another: "text_another this is not allowed, ignore it",
                            },
                            repeatable_1: [
                                "repeatable_1 text_rpt_1 index 0 new value",
                                "hello world from repeating groups",
                            ]
                        }
                    },
                },
                expected: {
                    redboxOid: "abcd",
                    metadata: {
                        group_1: {
                            text_1: 'text_1 new value',
                            group_2: { text_2: "group_1 group_2 text_2" },
                        },
                        repeatable_1: [
                            "repeatable_1 text_rpt_1 index 0 new value",
                            "hello world from repeating groups",
                        ]
                    }
                }
            }
        ];
        cases.forEach(({ args, expected }) => {
            it(`should merge as expected ${JSON.stringify(expected)} for args ${JSON.stringify(args)}`, (done) => {
                const clientFormConfig = {
                    name: "client-form-config",
                    type: "rdmp",
                    debugValue: true,
                    domElementType: 'form',
                    defaultComponentConfig: {
                        defaultComponentCssClasses: 'row',
                    },
                    editCssClasses: "redbox-form form",
                    skipValidationOnSave: false,
                    componentDefinitions: args.componentDefinitions ?? [],
                };
                const result = FormRecordConsistencyService.mergeRecordClientFormConfig(args.original, args.changed, clientFormConfig);
                expect(result).to.eql(expected);
                done();
            });
        });
        it("fails when permittedChanges does not have a 'properties' property", function () {
            const func = function () {
                FormRecordConsistencyService.mergeRecordMetadataPermitted({}, {}, {}, []);
            };
            expect(func).to.throw(Error, 'top level');
        });
        it("fails when permittedChanges nested object is invalid", function () {
            const record = { prop1: "value1" };
            const permittedChanges = { properties: { prop1: { wrong: "wrong" } } };
            const func = function () {
                FormRecordConsistencyService.mergeRecordMetadataPermitted(record, record, permittedChanges, []);
            };
            expect(func).to.throw(Error, 'elements');
        });
    });
    describe('buildDataModelDefault methods', function () {
        it("creates the expected default data model by using the most specific defaultValue", function () {
            const formConfig = {
                name: "remove-item-constraint-roles",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                componentDefinitions: [
                    {
                        name: 'group_1',
                        model: {
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {
                                    text_1: "group_1 text_1 default",
                                    group_2: { text_2: "group_1 group_2 text_2 default" }
                                }
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                componentDefinitions: [
                                    {
                                        name: 'text_1',
                                        model: { class: 'SimpleInputModel', config: { defaultValue: 'text_1 default' } },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'group_2',
                                        model: {
                                            class: 'GroupFieldModel',
                                            config: {
                                                defaultValue: {
                                                    text_3: "group_2 text_3 default",
                                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                                }
                                            }
                                        },
                                        component: {
                                            class: 'GroupFieldComponent',
                                            config: {
                                                componentDefinitions: [
                                                    {
                                                        name: 'text_2',
                                                        model: { class: 'SimpleInputModel', config: {} },
                                                        component: {
                                                            class: 'SimpleInputComponent'
                                                        },
                                                    },
                                                    {
                                                        name: 'text_3',
                                                        model: {
                                                            class: 'SimpleInputModel',
                                                            config: { defaultValue: "text_3 default" }
                                                        },
                                                        component: {
                                                            class: 'SimpleInputComponent'
                                                        },
                                                    },
                                                    {
                                                        name: 'repeatable_2',
                                                        model: {
                                                            class: 'RepeatableComponentModel',
                                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                                        },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    // Properties in the elementTemplate defaultValue are only used on the client side as the default for new items.
                                                                    // For the repeatable, the default is set in the RepeatableComponentModel.
                                                                    model: {
                                                                        class: 'SimpleInputModel',
                                                                        config: { defaultValue: "elementTemplate default" }
                                                                    },
                                                                    component: { class: 'SimpleInputComponent' },
                                                                },
                                                            },
                                                        },
                                                    },
                                                    {
                                                        name: 'repeatable_3',
                                                        model: {
                                                            class: 'RepeatableComponentModel',
                                                            config: {}
                                                        },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    model: { class: 'GroupFieldModel', config: {} },
                                                                    component: {
                                                                        class: 'GroupFieldComponent',
                                                                        config: {
                                                                            componentDefinitions: [
                                                                                {
                                                                                    name: 'text_group_repeatable_3',
                                                                                    model: { class: 'SimpleInputModel', config: { defaultValue: "text_group_repeatable_3 default" } },
                                                                                    component: {
                                                                                        class: 'SimpleInputComponent'
                                                                                    },
                                                                                },
                                                                            ]
                                                                        }
                                                                    }
                                                                },
                                                            },
                                                        },
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                    },
                    {
                        name: 'repeatable_1',
                        model: { class: 'RepeatableComponentModel', config: { defaultValue: [{ text_group_repeatable_1: "hello world from repeating groups" }] } },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    model: { class: 'GroupFieldModel', config: {} },
                                    component: {
                                        class: 'GroupFieldComponent',
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: 'text_group_repeatable_1',
                                                    model: { class: 'SimpleInputModel', config: {} },
                                                    component: {
                                                        class: 'SimpleInputComponent'
                                                    },
                                                },
                                            ]
                                        }
                                    }
                                }
                            },
                        },
                    }
                ]
            };
            const expected = {
                group_1: {
                    text_1: "text_1 default",
                    group_2: {
                        text_2: "group_1 group_2 text_2 default",
                        text_3: "text_3 default",
                        repeatable_2: [
                            "text_rpt_2 default 1",
                            "text_rpt_2 default 2",
                        ],
                        repeatable_3: [],
                    },
                },
                repeatable_1: [
                    { text_group_repeatable_1: "hello world from repeating groups" },
                ],
            };
            const result = FormRecordConsistencyService.buildDataModelDefaultForFormConfig(formConfig);
            expect(result).to.eql(expected);
        });
    });
    describe('validateRecordValues methods', async function () {
        it("passes when the record values are valid", async function () {
            const formConfig = {
                ...formModelConfigStandard,
                validators: [
                    { name: 'different-values', config: { controlNames: ['text_1', 'text_2'] } },
                ],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    { name: 'required' },
                                    { name: 'minLength', config: { minLength: 10 } },
                                    { name: 'maxLength', config: { maxLength: 20 } },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' }
                    },
                    {
                        name: 'text_2',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: '',
                                validators: [
                                    { name: 'required' },
                                    { name: 'requiredTrue' },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' }
                    },
                    {
                        name: 'group_2',
                        model: {
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                }
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                componentDefinitions: [
                                    {
                                        name: 'text_4',
                                        model: {
                                            class: 'SimpleInputModel', config: {
                                                validators: [
                                                    { name: 'min', config: { min: 5 } },
                                                    { name: 'max', config: { max: 15 } },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'SimpleInputModel',
                                            config: {
                                                defaultValue: "text_3 default",
                                                validators: [
                                                    {
                                                        name: 'pattern',
                                                        config: {
                                                            pattern: /^some.*$/,
                                                            description: "must start with 'some'"
                                                        }
                                                    },
                                                    {
                                                        name: 'minLength',
                                                        message: "@validator-error-custom-text_7",
                                                        config: { minLength: 3 }
                                                    },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'repeatable_2',
                                        model: {
                                            class: 'RepeatableComponentModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    model: {
                                                        class: 'SimpleInputModel', config: {
                                                            validators: [
                                                                { name: 'email' },
                                                            ]
                                                        }
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent',
                                                        config: { type: "email" }
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    {
                                        name: 'repeatable_3',
                                        model: {
                                            class: 'RepeatableComponentModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    model: { class: 'GroupFieldModel', config: {} },
                                                    component: {
                                                        class: 'GroupFieldComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: {
                                                                        class: 'RepeatableComponentModel',
                                                                        config: { defaultValue: ["repeatable_4 default 1", "repeatable_4 default 2"] }
                                                                    },
                                                                    component: {
                                                                        class: 'RepeatableComponent',
                                                                        config: {
                                                                            elementTemplate: {
                                                                                model: {
                                                                                    class: 'SimpleInputModel', config: {
                                                                                        validators: [
                                                                                            { name: 'required' },
                                                                                        ]
                                                                                    }
                                                                                },
                                                                                component: {
                                                                                    class: 'SimpleInputComponent',
                                                                                },
                                                                            },
                                                                        },
                                                                    },
                                                                },
                                                            ]
                                                        }
                                                    },
                                                },
                                            },
                                        },
                                    },
                                ]
                            }
                        }
                    }
                ],
            };
            const record = {
                metaMetadata: undefined,
                redboxOid: "",
                metadata: {
                    text_1: "text_1_value",
                    text_2: true,
                    group_2: {
                        text_4: 10,
                        text_3: "some text",
                        repeatable_2: [
                            "example@example.com",
                        ]
                    }
                }
            };
            const expected = [];
            let actual = null;
            const oldFormServiceGetFormByName = FormsService.getFormByName;
            try {
                FormsService.getFormByName = function (formName, editMode) {
                    return (0, rxjs_1.of)(formConfig);
                };
                actual = await FormRecordConsistencyService.validateRecordValuesForFormConfig(record);
            }
            finally {
                FormsService.getFormByName = oldFormServiceGetFormByName;
            }
            expect(actual).to.eql(expected);
        });
        it("fails when the record values are not valid", async function () {
            const formConfig = {
                ...formModelConfigStandard,
                validators: [
                    { name: 'different-values', config: { controlNames: ['text_1', 'text_2'] } },
                ],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    { name: 'minLength', config: { minLength: 20 } },
                                    { name: 'maxLength', config: { maxLength: 10 } },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' }
                    },
                    {
                        name: 'text_2',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: '',
                                validators: [
                                    { name: 'required' },
                                    { name: 'requiredTrue' },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' },
                        layout: { class: "DefaultLayoutComponent", config: { label: "@text_2_custom_label" } },
                    },
                    {
                        name: 'group_2',
                        model: {
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: [{ text_rpt_2: "group_2 repeatable_2 text_rpt_2 default" }]
                                }
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                componentDefinitions: [
                                    {
                                        name: 'text_4',
                                        model: {
                                            class: 'SimpleInputModel', config: {
                                                validators: [
                                                    { name: 'min', config: { min: 5 } },
                                                    { name: 'max', config: { max: 15 } },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'text_5',
                                        model: {
                                            class: 'SimpleInputModel', config: {
                                                validators: [
                                                    { name: 'required' },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'SimpleInputModel',
                                            config: {
                                                defaultValue: "text_3 default",
                                                validators: [
                                                    {
                                                        name: 'pattern',
                                                        config: {
                                                            pattern: /^other.*$/,
                                                            description: "must start with 'other'"
                                                        }
                                                    },
                                                    {
                                                        name: 'minLength',
                                                        message: "@validator-error-custom-text_7",
                                                        config: { minLength: 50 }
                                                    },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'repeatable_2',
                                        model: {
                                            class: 'RepeatableComponentModel',
                                            config: { defaultValue: [{ repeatable_2_item1: "text_rpt_2 default 1" }, { repeatable_2_item2: "text_rpt_2 default 2" }] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    model: {
                                                        class: 'SimpleInputModel', config: {
                                                            validators: [
                                                                { name: 'email' },
                                                            ]
                                                        }
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent'
                                                    },
                                                },
                                            },
                                        },
                                    },
                                ]
                            }
                        }
                    }
                ],
            };
            const record = {
                metaMetadata: undefined,
                redboxOid: "",
                metadata: {
                    text_1: "text_1_value",
                    text_2: "text_1_value",
                    group_2: {
                        text_4: 10,
                        text_3: "some text",
                        repeatable_2: [
                            "not an email",
                        ],
                        text_5: '',
                    }
                }
            };
            const expected = [
                {
                    "id": "text_1",
                    "message": null,
                    "parents": ["default-1.0-draft"],
                    "errors": [
                        {
                            "name": "minLength",
                            "message": "@validator-error-min-length",
                            "params": {
                                "actualLength": 12,
                                "requiredLength": 20,
                            }
                        },
                        {
                            "name": "maxLength",
                            "message": "@validator-error-max-length",
                            "params": {
                                "actualLength": 12,
                                "requiredLength": 10,
                            }
                        }
                    ]
                },
                {
                    "id": "text_2",
                    "message": "@text_2_custom_label",
                    "parents": ["default-1.0-draft"],
                    "errors": [
                        {
                            "name": "requiredTrue",
                            "message": "@validator-error-required-true",
                            "params": {
                                "actual": "text_1_value",
                                "required": true,
                            }
                        }
                    ]
                },
                {
                    "id": "text_5",
                    "message": null,
                    "parents": [
                        "default-1.0-draft",
                        "group_2"
                    ],
                    "errors": [
                        {
                            "message": "@validator-error-required",
                            "name": "required",
                            "params": {
                                "actual": "",
                                "required": true,
                            }
                        }
                    ]
                },
                {
                    "id": "text_3",
                    "message": null,
                    "parents": [
                        "default-1.0-draft",
                        "group_2"
                    ],
                    "errors": [
                        {
                            "name": "pattern",
                            "message": "@validator-error-pattern",
                            "params": {
                                "actual": "some text",
                                "description": "must start with 'other'",
                                "requiredPattern": "/^other.*$/",
                            }
                        },
                        {
                            "name": "minLength",
                            "message": "@validator-error-custom-text_7",
                            "params": {
                                "actualLength": 9,
                                "requiredLength": 50,
                            }
                        }
                    ]
                },
                {
                    "id": "default-1.0-draft",
                    "message": null,
                    "parents": [],
                    "errors": [
                        {
                            "name": "different-values",
                            "message": "@validator-error-different-values",
                            "params": {
                                "controlCount": 2,
                                "controlNames": [
                                    "text_1",
                                    "text_2"
                                ],
                                "valueCount": 1,
                                "values": [
                                    "text_1_value"
                                ]
                            }
                        }
                    ]
                }
            ];
            let actual = null;
            const oldFormServiceGetFormByName = FormsService.getFormByName;
            try {
                FormsService.getFormByName = function (formName, editMode) {
                    return (0, rxjs_1.of)(formConfig);
                };
                actual = await FormRecordConsistencyService.validateRecordValuesForFormConfig(record);
            }
            finally {
                FormsService.getFormByName = oldFormServiceGetFormByName;
            }
            expect(actual).to.eql(expected);
        });
    });
    describe('buildSchemaForFormConfig methods', function () {
        it("builds the expected schema", function () {
            const formConfig = {
                ...formModelConfigStandard,
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    { name: 'required' },
                                    { name: 'minLength', config: { minLength: 10 } },
                                    { name: 'maxLength', config: { maxLength: 20 } },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' }
                    },
                    {
                        name: 'text_2',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: '',
                                validators: [
                                    { name: 'required' },
                                    { name: 'requiredTrue' },
                                ]
                            }
                        },
                        component: { class: 'SimpleInputComponent' }
                    },
                    {
                        name: 'group_2',
                        model: {
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                }
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                componentDefinitions: [
                                    {
                                        name: 'text_4',
                                        model: {
                                            class: 'SimpleInputModel', config: {
                                                validators: [
                                                    { name: 'min', config: { min: 5 } },
                                                    { name: 'max', config: { max: 15 } },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'SimpleInputModel',
                                            config: {
                                                defaultValue: "text_3 default",
                                                validators: [
                                                    {
                                                        name: 'pattern',
                                                        config: {
                                                            pattern: /^some.*$/,
                                                            description: "must start with 'some'"
                                                        }
                                                    },
                                                    {
                                                        name: 'minLength',
                                                        message: "@validator-error-custom-text_7",
                                                        config: { minLength: 3 }
                                                    },
                                                ]
                                            }
                                        },
                                        component: { class: 'SimpleInputComponent' },
                                    },
                                    {
                                        name: 'repeatable_2',
                                        model: {
                                            class: 'RepeatableComponentModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    model: {
                                                        class: 'SimpleInputModel', config: {
                                                            validators: [
                                                                { name: 'email' },
                                                            ]
                                                        }
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent',
                                                        config: { type: "email" }
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    {
                                        name: 'repeatable_3',
                                        model: {
                                            class: 'RepeatableComponentModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    model: { class: 'GroupFieldModel', config: {} },
                                                    component: {
                                                        class: 'GroupFieldComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: {
                                                                        class: 'RepeatableComponentModel',
                                                                        config: { defaultValue: ["repeatable_4 default 1", "repeatable_4 default 2"] }
                                                                    },
                                                                    component: {
                                                                        class: 'RepeatableComponent',
                                                                        config: {
                                                                            elementTemplate: {
                                                                                model: {
                                                                                    class: 'SimpleInputModel', config: {
                                                                                        validators: [
                                                                                            { name: 'required' },
                                                                                        ]
                                                                                    }
                                                                                },
                                                                                component: {
                                                                                    class: 'SimpleInputComponent',
                                                                                },
                                                                            },
                                                                        },
                                                                    },
                                                                },
                                                            ]
                                                        }
                                                    },
                                                },
                                            },
                                        },
                                    },
                                ]
                            }
                        }
                    }
                ],
            };
            const expected = {
                "properties": {
                    "text_1": { "type": "string" },
                    "text_2": { "type": "string" },
                    "group_2": {
                        "properties": {
                            "text_3": { "type": "string" },
                            "text_4": { "type": "string" },
                            "repeatable_2": {
                                "elements": {
                                    "type": "string"
                                }
                            },
                            "repeatable_3": {
                                "elements": {
                                    "properties": {
                                        "repeatable_4": {
                                            "elements": {
                                                "type": "string"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const actual = FormRecordConsistencyService.buildSchemaForFormConfig(formConfig);
            expect(actual).to.eql(expected);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vdHlwZXNjcmlwdC90ZXN0L3VuaXQvc2VydmljZXMvRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQW9DO0FBT3BDLElBQUksTUFBeUIsQ0FBQztBQUM5QixNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQU9oRCxRQUFRLENBQUMsa0NBQWtDLEVBQUU7SUFDekMsTUFBTSxrQkFBa0IsR0FBZTtRQUNuQyxJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLElBQUksRUFBRSxNQUFNO1FBQ1osVUFBVSxFQUFFLElBQUk7UUFDaEIsY0FBYyxFQUFFLE1BQU07UUFDdEIsc0JBQXNCLEVBQUU7WUFDcEIsMEJBQTBCLEVBQUUsS0FBSztTQUNwQztRQUNELGNBQWMsRUFBRSxrQkFBa0I7UUFDbEMsb0JBQW9CLEVBQUUsS0FBSztLQUM5QixDQUFDO0lBQ0YsTUFBTSxpQkFBaUIsR0FBYztRQUNqQyxZQUFZLEVBQUUsRUFBRTtRQUNoQixJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLElBQUksRUFBRSxNQUFNO1FBQ1osY0FBYyxFQUFFLGtCQUFrQjtRQUNsQyxvQkFBb0IsRUFBRSxLQUFLO1FBQzNCLGdCQUFnQixFQUFFLFNBQVM7UUFDM0IsZ0JBQWdCLEVBQUUsU0FBUztRQUMzQixNQUFNLEVBQUUsRUFBRTtRQUNWLFFBQVEsRUFBRSxFQUFFO1FBQ1osc0JBQXNCLEVBQUUsRUFBRTtRQUMxQixjQUFjLEVBQUUsRUFBRTtLQUNyQixDQUFBO0lBQ0QsTUFBTSx1QkFBdUIsR0FBMkI7UUFDcEQsR0FBRyxrQkFBa0I7UUFDckIsR0FBRyxpQkFBaUI7S0FDdkIsQ0FB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