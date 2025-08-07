describe('The FormRecordConsistencyService', function () {
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
                                                    {
                                                        name: 'text_2',
                                                        model: {
                                                            class: 'TextFieldModel',
                                                            config: {value: 'hello world 2!'}
                                                        },
                                                        component: {class: 'TextFieldComponent', config: {}},
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
                                    group_1_component: {
                                        text_1: "text 1 value",
                                        text_2: "text 2 value",
                                        repeatable_for_admin: [
                                            {text_for_repeatable_for_admin: "rpt value 1"},
                                            {text_for_repeatable_for_admin: "rpt value 2"}
                                        ]
                                    }
                                },
                                {
                                    group_1_component: {
                                        text_1: "text 1 value 2",
                                        text_2: "text 2 value 2",
                                        repeatable_for_admin: [
                                            {text_for_repeatable_for_admin: "rpt value 1 2"},
                                            {text_for_repeatable_for_admin: "rpt value 2 2"}
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    changed: {
                        redboxOid: "abcd",
                        metadata: {
                            repeatable_group_1: [
                                {
                                    group_1_component: {
                                        text_1: "text 1 value",
                                        text_2: "text 2 value",
                                        repeatable_for_admin: [
                                            {text_for_repeatable_for_admin: "rpt value 1"},
                                            {text_for_repeatable_for_admin: "rpt value 2"}
                                        ]
                                    }
                                },
                                {
                                    group_1_component: {
                                        text_1: "text 1 value 2",
                                        text_2: "text 2 value 2",
                                        repeatable_for_admin: [
                                            {text_for_repeatable_for_admin: "rpt value 1 2"},
                                            {text_for_repeatable_for_admin: "rpt value 2 2"}
                                        ]
                                    }
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
                                group_1_component: {
                                    text_1: "text 1 value",
                                    text_2: "text 2 value",
                                    repeatable_for_admin: [
                                        {text_for_repeatable_for_admin: "rpt value 1"},
                                        {text_for_repeatable_for_admin: "rpt value 2"}
                                    ]
                                }
                            },
                            {
                                group_1_component: {
                                    text_1: "text 1 value 2",
                                    text_2: "text 2 value 2",
                                    repeatable_for_admin: [
                                        {text_for_repeatable_for_admin: "rpt value 1 2"},
                                        {text_for_repeatable_for_admin: "rpt value 2 2"}
                                    ]
                                }
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
                            model: {class: 'GroupFieldModel', config: {}},
                            component: {
                                class: 'GroupFieldComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'text_1',
                                            model: {class: 'TextFieldModel', config: {value: 'hello world 1!'}},
                                            component: {class: 'TextFieldComponent', config: {}},
                                        },
                                        {
                                            name: 'group_2',
                                            model: {class: 'GroupFieldModel', config: {}},
                                            component: {
                                                class: 'GroupFieldComponent',
                                                config: {
                                                    componentDefinitions: [
                                                        {
                                                            name: 'text_2',
                                                            model: {
                                                                class: 'TextFieldModel',
                                                                config: {}
                                                            },
                                                            component: {class: 'TextFieldComponent', config: {}},
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
                                config: {defaultValue: [{text_rpt_1: "hello world from repeating groups"}]}
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        name: 'text_rpt_1',
                                        model: {class: 'TextFieldModel', config: {}},
                                        component: {class: 'TextFieldComponent', config: {}},
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
                                group_2: {text_2: "group_1 group_2 text_2"},
                            },
                            repeatable_1: [
                                {text_rpt_1: "hello world from repeating groups"},
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
                                {
                                    text_rpt_1: "repeatable_1 text_rpt_1 index 0 new value",
                                    text_more: "text_more this is not allowed, ignore it",
                                },
                                {
                                    text_rpt_1: "hello world from repeating groups",
                                },
                            ]
                        }
                    },
                },
                expected: {
                    redboxOid: "abcd",
                    metadata: {
                        group_1: {
                            text_1: 'text_1 new value',
                            group_2: {text_2: "group_1 group_2 text_2"},
                        },
                        repeatable_1: [
                            {
                                text_rpt_1: "repeatable_1 text_rpt_1 index 0 new value",
                            },
                            {
                                text_rpt_1: "hello world from repeating groups",
                            },
                        ]
                    }
                }
            }
        ];
        cases.forEach(({args, expected}) => {
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
                const result = FormRecordConsistencyService.mergeRecordClientFormConfig(
                    args.original ?? {},
                    args.changed ?? {},
                    clientFormConfig
                );
                expect(result).to.eql(expected);
                done();
            });
        });
    });
});