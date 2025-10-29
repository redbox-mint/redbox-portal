import {FormConfigFrame, DefaultValueFormConfigVisitor, ConstructFormConfigVisitor} from "../../src";
import {formConfigExample1, reusableDefinitionsExample1} from "./example-data";
import {logger} from "./helpers";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Default Value Visitor", async () => {
    const cases: {
        title: string;
        args: FormConfigFrame;
        expected: Record<string, unknown>;
    }[] = [
        {
            title: "create simple example",
            args: {
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
                                    group_2: {text_2: "group_1 group_2 text_2 default"}
                                }
                            }
                        },
                        component: {
                            class: 'GroupComponent',
                            config: {
                                componentDefinitions: [
                                    {
                                        name: 'text_1',
                                        model: {class: 'SimpleInputModel', config: {defaultValue: 'text_1 default'}},
                                        component: {class: 'SimpleInputComponent'},
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
                                                        model: {class: 'SimpleInputModel', config: {}},
                                                        component: {
                                                            class: 'SimpleInputComponent'
                                                        },
                                                    },
                                                    {
                                                        name: 'text_3',
                                                        model: {
                                                            class: 'SimpleInputModel',
                                                            config: {defaultValue: "text_3 default"}
                                                        },
                                                        component: {
                                                            class: 'SimpleInputComponent'
                                                        },
                                                    },
                                                    {
                                                        name: 'repeatable_2',
                                                        model: {
                                                            class: 'RepeatableModel',
                                                            config: {defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"]}
                                                        },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    name: "",
                                                                    // Properties in the elementTemplate defaultValue are only used on the client side as the default for new items.
                                                                    // For the repeatable, the default is set in the RepeatableModel.
                                                                    model: {
                                                                        class: 'SimpleInputModel',
                                                                        config: {defaultValue: "elementTemplate default"}
                                                                    },
                                                                    component: {class: 'SimpleInputComponent'},
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
                                                                    name: "",
                                                                    model: {class: 'GroupModel', config: {}},
                                                                    component: {
                                                                        class: 'GroupComponent',
                                                                        config: {
                                                                            componentDefinitions: [
                                                                                {
                                                                                    name: 'text_group_repeatable_3',
                                                                                    model: {
                                                                                        class: 'SimpleInputModel',
                                                                                        config: {defaultValue: "text_group_repeatable_3 default"}
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
                            config: {defaultValue: [{text_group_repeatable_1: "hello world from repeating groups"}]}
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    name: "",
                                    model: {class: 'GroupModel', config: {}},
                                    component: {
                                        class: 'GroupComponent',
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: 'text_group_repeatable_1',
                                                    model: {class: 'SimpleInputModel', config: {}},
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
            },
            expected: {
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
                    {text_group_repeatable_1: "hello world from repeating groups"},
                ],
            },
        },
        {
            title: "create full example",
            args: formConfigExample1,
            expected: {
                "checkbox_1": "option1",
                "checkbox_multiple": [
                    "option1",
                    "option3",
                ],
                "dropdown_1": "Dropdown hello world!!!",
                "group_1_component": {
                    "group_2_component": {
                        "text_5": "hello world 5!"
                    },
                    "text_3": "hello world 3!",
                    "text_4": "hello world 4!"
                },
                "radio_1": "option1",
                "repeatable_group_1": [
                    {
                        "text_3": "hello world from repeating groups"
                    }
                ],
                "repeatable_textfield_1": [
                    "hello world from repeatable, default!"
                ],
                "text_1_event": "hello world!",
                "text_2": "hello world 2!",
                "text_2_component_event": "hello world 2! component expression",
                "text_2_event": "hello world! component event",
                "text_3_event": "hello world! layout event",
                "text_3_layout_event": "hello world 2! layout expression",
                "text_7": "hello world 2!",
                "textarea_1": "Textarea hello world!!!",
            }
        }
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start(args, "edit");

            const visitor = new DefaultValueFormConfigVisitor(logger);
            const actual = visitor.start(constructed);
            expect(actual).to.eql(expected);
        });
    });
});
