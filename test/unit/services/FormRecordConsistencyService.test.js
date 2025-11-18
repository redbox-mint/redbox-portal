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
                const result = FormRecordConsistencyService.mergeRecordClientFormConfig(args.original, args.changed, clientFormConfig, "edit");
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
            const result = FormRecordConsistencyService.buildDataModelDefaultForFormConfig(formConfig, "edit");
            expect(result).to.eql(expected);
        });
    });
    describe('validateRecordValues methods', async function () {
        it("passes when the record values are valid", async function () {
            const formConfig = {
                ...formModelConfigStandard,
                validators: [
                    { class: 'different-values', config: { controlNames: ['text_1', 'text_2'] } },
                ],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    { class: 'required' },
                                    { class: 'minLength', config: { minLength: 10 } },
                                    { class: 'maxLength', config: { maxLength: 20 } },
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
                                    { class: 'required' },
                                    { class: 'requiredTrue' },
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
                                                    { class: 'min', config: { min: 5 } },
                                                    { class: 'max', config: { max: 15 } },
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
                                                        class: 'pattern',
                                                        config: {
                                                            pattern: /^some.*$/,
                                                            description: "must start with 'some'"
                                                        }
                                                    },
                                                    {
                                                        class: 'minLength',
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
                                                                { class: 'email' },
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
                                                                                            { class: 'required' },
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
                    { class: 'different-values', config: { controlNames: ['text_1', 'text_2'] } },
                ],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    { class: 'minLength', config: { minLength: 20 } },
                                    { class: 'maxLength', config: { maxLength: 10 } },
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
                                    { class: 'required' },
                                    { class: 'requiredTrue' },
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
                                                    { class: 'min', config: { min: 5 } },
                                                    { class: 'max', config: { max: 15 } },
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
                                                    { class: 'required' },
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
                                                        class: 'pattern',
                                                        config: {
                                                            pattern: /^other.*$/,
                                                            description: "must start with 'other'"
                                                        }
                                                    },
                                                    {
                                                        class: 'minLength',
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
                                                                { class: 'email' },
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
                                    { class: 'required' },
                                    { class: 'minLength', config: { minLength: 10 } },
                                    { class: 'maxLength', config: { maxLength: 20 } },
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
                                    { class: 'required' },
                                    { class: 'requiredTrue' },
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
                                                    { class: 'min', config: { min: 5 } },
                                                    { class: 'max', config: { max: 15 } },
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
                                                        class: 'pattern',
                                                        config: {
                                                            pattern: /^some.*$/,
                                                            description: "must start with 'some'"
                                                        }
                                                    },
                                                    {
                                                        class: 'minLength',
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
                                                                { class: 'email' },
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
                                                                                            { class: 'required' },
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
            const actual = FormRecordConsistencyService.buildSchemaForFormConfig(formConfig, "edit");
            expect(actual).to.eql(expected);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vdHlwZXNjcmlwdC90ZXN0L3VuaXQvc2VydmljZXMvRm9ybVJlY29yZENvbnNpc3RlbmN5U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQW9DO0FBVXBDLElBQUksTUFBeUIsQ0FBQztBQUM5QixNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQU9oRCxRQUFRLENBQUMsa0NBQWtDLEVBQUU7SUFDekMsTUFBTSxrQkFBa0IsR0FBb0I7UUFDeEMsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixJQUFJLEVBQUUsTUFBTTtRQUNaLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLGNBQWMsRUFBRSxNQUFNO1FBQ3RCLHNCQUFzQixFQUFFO1lBQ3BCLDBCQUEwQixFQUFFLEtBQUs7U0FDcEM7UUFDRCxjQUFjLEVBQUUsa0JBQWtCO1FBQ2xDLG9CQUFvQixFQUFFLEtBQUs7UUFDM0Isb0JBQW9CLEVBQUUsRUFBRTtLQUMzQixDQUFDO0lBQ0YsTUFBTSxpQkFBaUIsR0FBYztRQUNqQyxZQUFZLEVBQUUsRUFBRTtRQUNoQixJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLElBQUksRUFBRSxNQUFNO1FBQ1osY0FBYyxFQUFFLGtCQUFrQjtRQUNsQyxvQkFBb0IsRUFBRSxLQUFLO1FBQzNCLGdCQUFnQixFQUFFLFNBQVM7UUFDM0IsZ0JBQWdCLEVBQUUsU0FBUztRQUMzQixNQUFNLEVBQUUsRUFBRTtRQUNWLFFBQVEsRUFBRSxFQUFFO1FBQ1osc0JBQXNCLEVBQUUsRUFBRTtRQUMxQixjQUFjLEVBQUUsRUFBRTtLQUNyQixDQUFBO0lBQ0QsTUFBTSx1QkFBdUIsR0FBZ0M7UUFDekQsR0FBRyxrQkFBa0I7UUFD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