describe('The FormRecordConsistencyService', function () {
    it('should detect simple changes', function () {
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
                with: ['a', 'few', 'more', 'elements', {than: 'before'}],
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
                changed: {than: 'before'},
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

    it('should merge properly with no changes', function () {
        const clientFormConfig = {
            name: "remove-items-constrains-nested",
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
                    name: 'repeatable_group_1',
                    model: {
                        class: 'RepeatableComponentModel',
                        config: {value: [{text_1: "hello world from repeating groups"}]}
                    },
                    component: {
                        class: 'RepeatableComponent',
                        config: {
                            elementTemplate: {
                                name: 'group_1_component',
                                model: {class: 'GroupFieldModel', config: {defaultValue: {}}},
                                component: {
                                    class: 'GroupFieldComponent',
                                    config: {
                                        wrapperCssClasses: 'col',
                                        componentDefinitions: [
                                            // <-- requires mode edit, so expect to be removed
                                            {
                                                name: 'text_2',
                                                model: {class: 'TextFieldModel', config: {value: 'hello world 2!'}},
                                                component: {class: 'TextFieldComponent', config: {}},
                                            },
                                            // <-- requires role 'Admin', so is removed
                                        ]
                                    }
                                },
                                layout: {
                                    class: 'RepeatableElementLayoutComponent',
                                    config: {hostCssClasses: 'row align-items-start'}
                                },
                                // <-- requires mode view, so is kept, constraints removed
                            }
                        },
                    },
                    layout: {
                        class: 'DefaultLayoutComponent',
                        config: {
                            label: 'Repeatable TextField with default wrapper defined',
                            helpText: 'Repeatable component help text',
                        }
                    },
                },
            ]
        };
        const record = {
            redboxOid: "abcd",
            metadata: {
                repeatable_group_1: [
                    {
                        group_1_component: {
                            text_1: "text 1 value",
                            text_2: "text 2 value",
                            repeatable_for_admin: [
                                {
                                    text_for_repeatable_for_admin: "rpt value 1",
                                },
                                {
                                    text_for_repeatable_for_admin: "rpt value 2",
                                }
                            ]
                        }
                    },
                    {
                        group_1_component: {
                            text_1: "text 1 value 2",
                            text_2: "text 2 value 2",
                            repeatable_for_admin: [
                                {
                                    text_for_repeatable_for_admin: "rpt value 1 2",
                                },
                                {
                                    text_for_repeatable_for_admin: "rpt value 2 2",
                                }
                            ]
                        }
                    }
                ]
            }
        };
        const result = FormRecordConsistencyService.mergeRecordProvided(record, record, clientFormConfig);

        expect(result).to.eql(record);
    });
    it('should merge properly with changes', function () {
        const clientFormConfig = {
            name: "remove-items-constrains-nested",
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
                    name: 'repeatable_group_1',
                    model: {
                        class: 'RepeatableComponentModel',
                        config: {value: [{text_1: "hello world from repeating groups"}]}
                    },
                    component: {
                        class: 'RepeatableComponent',
                        config: {
                            elementTemplate: {
                                name: 'group_1_component',
                                model: {class: 'GroupFieldModel', config: {defaultValue: {}}},
                                component: {
                                    class: 'GroupFieldComponent',
                                    config: {
                                        wrapperCssClasses: 'col',
                                        componentDefinitions: [
                                            // <-- requires mode edit, so expect to be removed
                                            {
                                                name: 'text_2',
                                                model: {class: 'TextFieldModel', config: {value: 'hello world 2!'}},
                                                component: {class: 'TextFieldComponent', config: {}},
                                            },
                                            // <-- requires role 'Admin', so is removed
                                        ]
                                    }
                                },
                                layout: {
                                    class: 'RepeatableElementLayoutComponent',
                                    config: {hostCssClasses: 'row align-items-start'}
                                },
                                // <-- requires mode view, so is kept, constraints removed
                            }
                        },
                    },
                    layout: {
                        class: 'DefaultLayoutComponent',
                        config: {
                            label: 'Repeatable TextField with default wrapper defined',
                            helpText: 'Repeatable component help text',
                        }
                    },
                },
            ]
        };
        const newRecord = {
            redboxOid: "abcd",
            metadata: {
                repeatable_group_1: [
                    // text_1 is not allowed for the current user, ignore it
                    {group_1_component: {text_1: "grp 1 text 1 value new", text_2: "text 2 value new"}},
                    // repeatable_for_admin is not allowed for the current user, ignore it
                    {group_1_component: {text_2: "grp 2 text 2 value new", repeatable_for_admin: []}},
                    {group_1_component: {text_2: "grp 3 text 2 value new",}},
                    // text_1 is not allowed for the current user, ignore it
                    {group_1_component: {text_1: "grp 4 text 1 value new",}},
                ]
            }
        };
        const existingRecord = {
            redboxOid: "abcd",
            metadata: {
                repeatable_group_1: [
                    {
                        group_1_component: {
                            text_1: "grp 1 text 1 value 1",
                            text_2: "grp 1 text 2 value 1",
                            repeatable_for_admin: [
                                {text_for_repeatable_for_admin: "rpt 1 value 1",},
                                {text_for_repeatable_for_admin: "rpt 1 value 2",}
                            ]
                        }
                    },
                    {
                        group_1_component: {
                            text_1: "grp 2 text 1 value 1",
                            text_2: "grp 2 text 2 value 1",
                            repeatable_for_admin: [
                                {text_for_repeatable_for_admin: "rpt 2 value 1",},
                                {text_for_repeatable_for_admin: "rpt 2 value 2",}
                            ]
                        }
                    }
                ]
            }
        };
        const expected = {
            redboxOid: "abcd",
            metadata: {
                repeatable_group_1: [
                    {
                        group_1_component: {
                            text_1: "grp 1 text 1 value 1",
                            text_2: "grp 1 text 2 value new",
                            repeatable_for_admin: [
                                {text_for_repeatable_for_admin: "rpt 1 value 1",},
                                {text_for_repeatable_for_admin: "rpt 1 value 2",}
                            ]
                        }
                    },
                    {
                        group_1_component: {
                            text_1: "grp 2 text 1 value 1",
                            text_2: "grp 2 text 2 value new",
                            repeatable_for_admin: [
                                {text_for_repeatable_for_admin: "rpt 2 value 1",},
                                {text_for_repeatable_for_admin: "rpt 2 value 2",}
                            ]
                        }
                    },
                    {
                        group_1_component: {
                            text_2: "grp 3 text 2 value new"
                        }
                    }
                ]
            }
        };
        const result = FormRecordConsistencyService.mergeRecordProvided(newRecord, existingRecord, clientFormConfig);

        expect(result).to.eql(expected);
    });
});