import { Observable, of } from "rxjs";
import {
    FormRecordConsistencyService as FormRecordConsistencyModule,
    FormsService as FormsModule
} from "@researchdatabox/redbox-core-types";
import {
    AvailableFormComponentDefinitionFrames,
    FormConfigFrame, FormValidatorSummaryErrors,
} from "@researchdatabox/sails-ng-common";
import BasicRedboxRecord = FormRecordConsistencyModule.Services.BasicRedboxRecord;
import { FormModel } from "@researchdatabox/redbox-core-types";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

declare const FormRecordConsistencyService: FormRecordConsistencyModule.Services.FormRecordConsistency;
type FormRecordConsistencyChange = FormRecordConsistencyModule.Services.FormRecordConsistencyChange;
declare const FormsService: FormsModule.Services.Forms;


describe('The FormRecordConsistencyService', function () {
    const formConfigStandard: FormConfigFrame = {
        name: "default-1.0-draft",
        type: "rdmp",
        debugValue: true,
        domElementType: 'form',
        defaultComponentConfig: {
            defaultComponentCssClasses: 'row',
        },
        editCssClasses: "redbox-form form",
        enabledValidationGroups: ["all"],
        componentDefinitions: [],
    };
    const formModelStandard: FormModel = {
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
    }
    const formModelConfigStandard: FormModel & FormConfigFrame = {
        ...formConfigStandard,
        ...formModelStandard,
    }
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
        const expected: FormRecordConsistencyChange[] = [
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
        expect(outcome).to.eql(expected)
    });

    describe('mergeRecord methods', function () {
        const cases: {
            args: {
                componentDefinitions: AvailableFormComponentDefinitionFrames[],
                original: BasicRedboxRecord,
                changed: BasicRedboxRecord
            },
            expected: BasicRedboxRecord,
        }[] = [
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
                                            model: {
                                                class: 'GroupModel',
                                                config: { newEntryValue: { text_2: 'hello world 2!' } }
                                            },
                                            component: {
                                                class: 'GroupComponent',
                                                config: {
                                                    wrapperCssClasses: 'col',
                                                    componentDefinitions: [
                                                        {
                                                            name: 'text_2',
                                                            model: { class: 'SimpleInputModel', config: {} },
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
                const clientFormConfig: FormConfigFrame = {
                    name: "client-form-config",
                    type: "rdmp",
                    debugValue: true,
                    domElementType: 'form',
                    defaultComponentConfig: {
                        defaultComponentCssClasses: 'row',
                    },
                    editCssClasses: "redbox-form form",
                    enabledValidationGroups: ["all"],
                    componentDefinitions: args.componentDefinitions ?? [],
                };
                const result = FormRecordConsistencyService.mergeRecordClientFormConfig(
                    args.original,
                    args.changed,
                    clientFormConfig,
                    "edit",
                );
                expect(result).to.eql(expected);
                done();
            });
        });

        it("fails when permittedChanges is not the expected structure", function () {
            const record = { prop1: "value1" };
            const permittedChanges = { prop1: { prop2: { prop3: "value1" } } };
            const func = function () {
                FormRecordConsistencyService.mergeRecordMetadataPermitted(record, record, permittedChanges, [])
            }
            expect(func).to.throw(Error, 'all definitions must have a property that is one');
        });
        it("fails when permittedChanges nested object is invalid", function () {
            const record = { prop1: "value1" };
            const permittedChanges = { properties: { prop1: { wrong: "wrong" } } };
            const func = function () {
                FormRecordConsistencyService.mergeRecordMetadataPermitted(record, record, permittedChanges, []);
            }
            expect(func).to.throw(Error, 'elements');
        });
    });

    describe('buildDataModelDefault methods', function () {
        it("creates the expected default data model by using the most specific defaultValue", function () {
            const formConfig: FormConfigFrame = {
                name: "remove-item-constraint-roles",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                enabledValidationGroups: ["all"],
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
                                                                        config: { newEntryValue: "elementTemplate default" }
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
                                                                    model: {
                                                                        class: 'GroupModel', config: {
                                                                            newEntryValue: {
                                                                                text_group_repeatable_3: "text_group_repeatable_3 default"
                                                                            }
                                                                        }
                                                                    },
                                                                    component: {
                                                                        class: 'GroupComponent',
                                                                        config: {
                                                                            componentDefinitions: [
                                                                                {
                                                                                    name: 'text_group_repeatable_3',
                                                                                    model: {
                                                                                        class: 'SimpleInputModel',
                                                                                        config: {}
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
            const formConfig: FormModel & FormConfigFrame = {
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
                                                    model: {
                                                        class: 'GroupModel',
                                                        config: { newEntryValue: { repeatable_4: ["repeatable_4 default 1", "repeatable_4 default 2"] } }
                                                    },
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: { class: 'RepeatableModel', config: {} },
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
            const record: BasicRedboxRecord = {
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
                FormsService.getFormByName = function (formName, editMode): Observable<any> {
                    return of({ configuration: formConfig })
                }
                actual = await FormRecordConsistencyService.validateRecordValuesForFormConfig(record);
            } finally {
                FormsService.getFormByName = oldFormServiceGetFormByName;
            }

            expect(actual).to.eql(expected);
        });
        it("fails when the record values are not valid", async function () {
            const formConfig: FormModel & FormConfigFrame = {
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
            const record: BasicRedboxRecord = {
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
            const expected: FormValidatorSummaryErrors[] = [
                {
                    "id": "text_1",
                    "message": null,
                    lineagePaths: {
                        formConfig: ["componentDefinitions", "0"],
                        dataModel: ["text_1"],
                        angularComponents: ["text_1"],
                        angularComponentsJsonPointer: "/text_1",
                    },
                    "errors": [
                        {
                            "class": "minLength",
                            "message": "@validator-error-min-length",
                            "params": {
                                "actualLength": 12,
                                "requiredLength": 20,
                            }
                        },
                        {
                            "class": "maxLength",
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
                    lineagePaths: {
                        formConfig: ["componentDefinitions", "1"],
                        dataModel: ["text_2"],
                        angularComponents: ["text_2"],
                        angularComponentsJsonPointer: "/text_2",
                    },
                    "errors": [
                        {
                            "class": "requiredTrue",
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
                    lineagePaths: {
                        formConfig: [
                            "componentDefinitions",
                            "2",
                            "component",
                            "config",
                            "componentDefinitions",
                            "1"
                        ], dataModel: ["group_2", "text_5"],
                        angularComponents: ["group_2", "text_5"],
                        angularComponentsJsonPointer: "/group_2/text_5",
                    },
                    "errors": [
                        {
                            "message": "@validator-error-required",
                            "class": "required",
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
                    lineagePaths: {
                        formConfig: [
                            "componentDefinitions",
                            "2",
                            "component",
                            "config",
                            "componentDefinitions",
                            "2"
                        ], dataModel: ["group_2", "text_3"],
                        angularComponents: ["group_2", "text_3"],
                        angularComponentsJsonPointer: "/group_2/text_3",
                    },
                    "errors": [
                        {
                            "class": "pattern",
                            "message": "@validator-error-pattern",
                            "params": {
                                "actual": "some text",
                                "description": "must start with 'other'",
                                "requiredPattern": "/^other.*$/",
                            }
                        },
                        {
                            "class": "minLength",
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
                    lineagePaths: {
                        formConfig: [],
                        dataModel: [],
                        angularComponents: [],
                        angularComponentsJsonPointer: "",
                    },
                    "errors": [
                        {
                            "class": "different-values",
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
                FormsService.getFormByName = function (formName, editMode): Observable<any> {
                    return of({ configuration: formConfig })
                }
                actual = await FormRecordConsistencyService.validateRecordValuesForFormConfig(record);
            } finally {
                FormsService.getFormByName = oldFormServiceGetFormByName;
            }

            const normalizeErrorResults = (results: any[]) => {
                return (results || []).map((item: any) => {
                    const copy = _.cloneDeep(item);
                    delete copy.parents;
                    delete copy.lineagePaths;
                    return copy;
                });
            };

            expect(normalizeErrorResults(actual)).to.eql(normalizeErrorResults(expected));
        });
    });

    describe('buildSchemaForFormConfig methods', function () {
        it("builds the expected schema", function () {
            const formConfig: FormModel & FormConfigFrame = {
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
                                                    model: {
                                                        class: 'GroupModel', config: {
                                                            newEntryValue: {
                                                                repeatable_4: ["repeatable_4 default 1", "repeatable_4 default 2"]
                                                            }
                                                        }
                                                    },
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: { class: 'RepeatableModel', config: {} },
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
    })
        ;
})
    ;
