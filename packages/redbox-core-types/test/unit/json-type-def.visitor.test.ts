import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { ConstructFormConfigVisitor } from "../../src/visitor/construct.visitor";
import { JsonTypeDefSchemaFormConfigVisitor } from "../../src/visitor/json-type-def.visitor";
import {formConfigExample1} from "./example-data";
import {logger} from "./helpers";
import {reusableFormDefinitions} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("JSON Type Def Schema Visitor", async () => {
    const cases: {
        title: string;
        args: FormConfigFrame;
        expected: Record<string, unknown>;
    }[] = [
        {
            title: "create basic example",
            args: {
                name: "default-1.0-draft",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                componentDefinitions: [
                    {
                        name: 'text_1',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: 'hello world!',
                                validators: [
                                    {class: 'required'},
                                    {class: 'minLength', config: {minLength: 10}},
                                    {class: 'maxLength', config: {maxLength: 20}},
                                ]
                            }
                        },
                        component: {class: 'SimpleInputComponent'}
                    },
                    {
                        name: 'text_2',
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                defaultValue: '',
                                validators: [
                                    {class: 'required'},
                                    {class: 'requiredTrue'},
                                ]
                            }
                        },
                        component: {class: 'SimpleInputComponent'}
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
                                                    {class: 'min', config: {min: 5}},
                                                    {class: 'max', config: {max: 15}},
                                                ]
                                            }
                                        },
                                        component: {class: 'SimpleInputComponent'},
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
                                                        config: {minLength: 3}
                                                    },
                                                ]
                                            }
                                        },
                                        component: {class: 'SimpleInputComponent'},
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
                                                    model: {
                                                        class: 'SimpleInputModel', config: {
                                                            validators: [
                                                                {class: 'email'},
                                                            ]
                                                        }
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent',
                                                        config: {type: "email"}
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    {
                                        name: 'repeatable_3',
                                        model: {
                                            class: 'RepeatableModel',
                                            config: {defaultValue: ["text_rpt_2 default 1", "text_rpt_2 default 2"]}
                                        },
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: "",
                                                    model: {class: 'GroupModel', config: {newEntryValue:{repeatable_4: ["repeatable_4 default 1", "repeatable_4 default 2"]}}},
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'repeatable_4',
                                                                    model: {
                                                                        class: 'RepeatableModel',
                                                                        config: {}
                                                                    },
                                                                    component: {
                                                                        class: 'RepeatableComponent',
                                                                        config: {
                                                                            elementTemplate: {
                                                                                name: "",
                                                                                model: {
                                                                                    class: 'SimpleInputModel', config: {
                                                                                        validators: [
                                                                                            {class: 'required'},
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
            },
            expected: {
                "properties": {
                    "text_1": {"type": "string"},
                    "text_2": {"type": "string"},
                    "group_2": {
                        "properties": {
                            "text_3": {"type": "string"},
                            "text_4": {"type": "string"},
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
            },
        },
        {
            title: "create full example",
            args: formConfigExample1,
            expected: {
                "properties": {
                    "checkbox_1": {
                        "type": "string"
                    },
                    "checkbox_multiple": {
                        "type": "array"
                    },
                    "date_1": {
                        "type": "string"
                    },
                    "date_2": {
                        "type": "string"
                    },
                    "dropdown_1": {
                        "type": "string"
                    },
                    "group_1_component": {
                        "properties": {
                            "group_2_component": {
                                "properties": {
                                    "text_5": {
                                        "type": "string"
                                    }
                                }
                            },
                            "text_3": {
                                "type": "string"
                            },
                            "text_4": {
                                "type": "string"
                            }
                        }
                    },
                  "questiontree_1": {
                    "properties": {
                      "question_1": {
                        "type": "string"
                      },
                      "question_2": {
                        "type": "string"
                      }
                    },
                  },
                    "radio_1": {
                        "type": "string"
                    },
                    "repeatable_group_1": {
                        "elements": {
                            "properties": {
                                "text_3": {
                                    "type": "string"
                                }
                            }
                        }
                    },
                    "repeatable_textfield_1": {
                        "elements": {
                            "type": "string"
                        }
                    },
                    "text_1_event": {
                        "type": "string"
                    },
                    "text_2": {
                        "type": "string"
                    },
                    "text_2_component_event": {
                        "type": "string"
                    },
                    "text_2_event": {
                        "type": "string"
                    },
                    "text_3_event": {
                        "type": "string"
                    },
                    "text_3_layout_event": {
                        "type": "string"
                    },
                    "text_7": {
                        "type": "string"
                    },
                    "textarea_1": {
                        "type": "string"
                    },
                }
            }
        },
        {
            title: "create typeahead schema from valueMode",
            args: {
                name: "typeahead-form",
                componentDefinitions: [
                    {
                        name: "person_lookup",
                        component: {
                            class: "TypeaheadInputComponent",
                            config: {
                                sourceType: "namedQuery",
                                queryId: "contributors",
                                valueMode: "optionObject"
                            }
                        },
                        model: {class: "TypeaheadInputModel", config: {}}
                    }
                ]
            },
            expected: {
                properties: {
                    person_lookup: {
                        properties: {
                            label: {type: "string"},
                            value: {type: "string"}
                        },
                        optionalProperties: {
                            sourceType: {type: "string"}
                        }
                    }
                }
            }
        }
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start({
              data: args, formMode: "edit", reusableFormDefs: reusableFormDefinitions,
            });

            const visitor = new JsonTypeDefSchemaFormConfigVisitor(logger);
            const actual = visitor.start({form: constructed});
            expect(actual).to.eql(expected);
        });
    });
});
