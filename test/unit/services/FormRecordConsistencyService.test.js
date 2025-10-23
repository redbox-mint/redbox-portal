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
        componentDefinitions: [],
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
                                class: 'RepeatableModel',
                                config: { defaultValue: [{ text_1: "hello world from repeating groups" }] }
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        name: null,
                                        model: { class: 'GroupModel', config: { defaultValue: {} } },
                                        component: {
                                            class: 'GroupComponent',
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
                    // NOTE: can't specify array contents that differ from the provided form config,
                    //        and none of the components in the elementTemplate or child components,
                    //        can use constraints, as the values not accessible to any user will be overwritten
                    //        when users without access save the form
                    original: {
                        redboxOid: "abcd",
                        metadata: {
                            repeatable_for_admin: [
                                { text_for_repeatable_for_admin: "rpt value 1" },
                                { text_for_repeatable_for_admin: "rpt value 2" }
                            ],
                            repeatable_group_1: [
                                {
                                    text_2: "text 2 value",
                                },
                                {
                                    text_2: "text 2 value 2",
                                }
                            ]
                        }
                    },
                    changed: {
                        redboxOid: "abcd",
                        metadata: {
                            repeatable_for_admin: [
                                { text_for_repeatable_for_admin: "rpt value 1" },
                                { text_for_repeatable_for_admin: "rpt value 2" }
                            ],
                            repeatable_group_1: [
                                {
                                    text_2: "text 2 value",
                                },
                                {
                                    text_2: "text 2 value 2",
                                }
                            ]
                        }
                    }
                },
                expected: {
                    redboxOid: "abcd",
                    metadata: {
                        repeatable_for_admin: [
                            { text_for_repeatable_for_admin: "rpt value 1" },
                            { text_for_repeatable_for_admin: "rpt value 2" }
                        ],
                        repeatable_group_1: [
                            {
                                text_2: "text 2 value",
                            },
                            {
                                text_2: "text 2 value 2",
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
                            model: { class: 'GroupModel', config: {} },
                            component: {
                                class: 'GroupComponent',
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
                                            model: { class: 'GroupModel', config: {} },
                                            component: {
                                                class: 'GroupComponent',
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
                                class: 'RepeatableModel',
                                config: { defaultValue: ["hello world from repeating groups"] }
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        name: null,
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
        it("fails when permittedChanges is not the expected structure", function () {
            const record = { prop1: "value1" };
            const permittedChanges = { prop1: { prop2: { prop3: "value1" } } };
            const func = function () {
                FormRecordConsistencyService.mergeRecordMetadataPermitted(record, record, permittedChanges, []);
            };
            expect(func).to.throw(Error, 'all definitions must have a property that is one');
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
                            class: 'GroupModel',
                            config: {
                                defaultValue: {
                                    text_1: "group_1 text_1 default",
                                    group_2: { text_2: "group_1 group_2 text_2 default" }
                                }
                            }
                        },
                        component: {
                            class: 'GroupComponent',
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
                                            class: 'GroupModel',
                                            config: {
                                                defaultValue: {
                                                    text_3: "group_2 text_3 default",
                                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                                }
                                            }
                                        },
                                        component: {
                                            class: 'GroupComponent',
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
                                                            class: 'RepeatableModel',
                                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                                        },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    name: null,
                                                                    // Properties in the elementTemplate defaultValue are only used on the client side as the default for new items.
                                                                    // For the repeatable, the default is set in the RepeatableModel.
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
                                                            class: 'RepeatableModel',
                                                            config: {}
                                                        },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    name: null,
                                                                    model: { class: 'GroupModel', config: {} },
                                                                    component: {
                                                                        class: 'GroupComponent',
                                                                        config: {
                                                                            componentDefinitions: [
                                                                                {
                                                                                    name: 'text_group_repeatable_3',
                                                                                    model: {
                                                                                        class: 'SimpleInputModel',
                                                                                        config: { defaultValue: "text_group_repeatable_3 default" }
                                                                                    },
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
                        model: {
                            class: 'RepeatableModel',
                            config: { defaultValue: [{ text_group_repeatable_1: "hello world from repeating groups" }] }
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    name: null,
                                    model: { class: 'GroupModel', config: {} },
                                    component: {
                                        class: 'GroupComponent',
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
                            class: 'GroupModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                }
                            }
                        },
                        component: {
                            class: 'GroupComponent',
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
                                            class: 'RepeatableModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: null,
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
                                            class: 'RepeatableModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: null,
                                                    model: { class: 'GroupModel', config: {} },
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: {
                                                                        class: 'RepeatableModel',
                                                                        config: { defaultValue: ["repeatable_4 default 1", "repeatable_4 default 2"] }
                                                                    },
                                                                    component: {
                                                                        class: 'RepeatableComponent',
                                                                        config: {
                                                                            elementTemplate: {
                                                                                name: null,
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
                        layout: { class: "DefaultLayout", config: { label: "@text_2_custom_label" } },
                    },
                    {
                        name: 'group_2',
                        model: {
                            class: 'GroupModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: [{ text_rpt_2: "group_2 repeatable_2 text_rpt_2 default" }]
                                }
                            }
                        },
                        component: {
                            class: 'GroupComponent',
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
                                            class: 'RepeatableModel',
                                            config: { defaultValue: [{ repeatable_2_item1: "text_rpt_2 default 1" }, { repeatable_2_item2: "text_rpt_2 default 2" }] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: null,
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
                            class: 'GroupModel',
                            config: {
                                defaultValue: {
                                    text_3: "group_2 text_3 default",
                                    repeatable_2: ["group_2 repeatable_2 text_rpt_2 default"]
                                }
                            }
                        },
                        component: {
                            class: 'GroupComponent',
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
                                            class: 'RepeatableModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: null,
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
                                            class: 'RepeatableModel',
                                            config: { defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"] }
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: null,
                                                    model: { class: 'GroupModel', config: {} },
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: {
                                                                        class: 'RepeatableModel',
                                                                        config: { defaultValue: ["repeatable_4 default 1", "repeatable_4 default 2"] }
                                                                    },
                                                                    component: {
                                                                        class: 'RepeatableComponent',
                                                                        config: {
                                                                            elementTemplate: {
                                                                                name: null,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vdHlwZXNjcmlwdC90ZXN0L3VuaXQvc2VydmljZXMvRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQW9DO0FBVXBDLElBQUksTUFBeUIsQ0FBQztBQUM5QixNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQU9oRCxRQUFRLENBQUMsa0NBQWtDLEVBQUU7SUFDekMsTUFBTSxrQkFBa0IsR0FBb0I7UUFDeEMsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixJQUFJLEVBQUUsTUFBTTtRQUNaLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLGNBQWMsRUFBRSxNQUFNO1FBQ3RCLHNCQUFzQixFQUFFO1lBQ3BCLDBCQUEwQixFQUFFLEtBQUs7U0FDcEM7UUFDRCxjQUFjLEVBQUUsa0JBQWtCO1FBQ2xDLG9CQUFvQixFQUFFLEtBQUs7UUFDM0Isb0JBQW9CLEVBQUUsRUFBRTtLQUMzQixDQUFDO0lBQ0YsTUFBTSxpQkFBaUIsR0FBYztRQUNqQyxZQUFZLEVBQUUsRUFBRTtRQUNoQixJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLElBQUksRUFBRSxNQUFNO1FBQ1osY0FBYyxFQUFFLGtCQUFrQjtRQUNsQyxvQkFBb0IsRUFBRSxLQUFLO1FBQzNCLGdCQUFnQixFQUFFLFNBQVM7UUFDM0IsZ0JBQWdCLEVBQUUsU0FBUztRQUMzQixNQUFNLEVBQUUsRUFBRTtRQUNWLFFBQVEsRUFBRSxFQUFFO1FBQ1osc0JBQXNCLEVBQUUsRUFBRTtRQUMxQixjQUFjLEVBQUUsRUFBRTtLQUNyQixDQUFBO0lBQ0QsTUFBTSx1QkFBdUIsR0FBZ0M7UUFDekQsR0FBRyxrQkFBa0I7UUFD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