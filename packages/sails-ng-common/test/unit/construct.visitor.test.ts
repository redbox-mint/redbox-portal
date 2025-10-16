import {
    ConstructFormConfigVisitor,
    FormConfig,
    FormConfigFrame,
} from "../../src";

// @ts-ignore
import {default as default_1_0_draft_form_config} from "./../../../../../form-config/default-1.0-draft.js";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Construct Visitor", async () => {
    const cases: {
        args: FormConfigFrame;
        expected: { useArgs: boolean, value?: FormConfig };
    }[] = [
        {
            // empty
            args: {name: '', componentDefinitions: []},
            expected: {useArgs: false, value: new FormConfig()},
        },
        {
            // simple example
            args: {
                name: '',
                componentDefinitions: [
                    {
                        name: 'repeatable_group_1',
                        model: {
                            class: 'RepeatableModel',
                            config: {
                                defaultValue: [{text_3: "hello world from repeating groups"}]
                            }
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    // first group component
                                    name: "",
                                    model: {
                                        class: 'GroupModel',
                                        config: {
                                            defaultValue: {},
                                        }
                                    },
                                    component: {
                                        class: 'GroupComponent',
                                        config: {
                                            wrapperCssClasses: 'col',
                                            componentDefinitions: [
                                                {
                                                    name: 'text_3',
                                                    model: {
                                                        class: 'SimpleInputModel',
                                                        config: {
                                                            defaultValue: 'hello world 3!',
                                                            validators: [
                                                                {
                                                                    name: 'minLength',
                                                                    message: "@validator-error-custom-text_3",
                                                                    config: {minLength: 3}
                                                                }
                                                            ]
                                                        }
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent',
                                                        config: {
                                                            type: 'text'
                                                        }
                                                    }
                                                },
                                            ]
                                        }
                                    },
                                    layout: {
                                        class: 'RepeatableElementLayout',
                                        config: {
                                            hostCssClasses: 'row align-items-start'
                                        }
                                    },
                                }
                            },
                        },
                        layout: {
                            class: 'DefaultLayout',
                            config: {
                                label: 'Repeatable TextField not inside the tab with default wrapper defined',
                                helpText: 'Repeatable component help text',
                            }
                        },
                    }
                ]
            },
            expected: {useArgs: true},
        },
        {
            args: default_1_0_draft_form_config,
            expected: {useArgs: true},
        }
    ];
    cases.forEach(({args, expected}) => {
        it(`should '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new ConstructFormConfigVisitor();
            const actual = visitor.start(args);
            if (expected.useArgs) {
                expect(actual).to.containSubset(args);
            } else {
                expect(actual).to.eql(expected.value);
            }
        });
    });
});
