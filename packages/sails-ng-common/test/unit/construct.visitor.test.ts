import {ConstructFormConfigVisitor} from "../../src/config/visitor/construct.visitor";
import {
    FormConfig,
    FormConfigFrame,
    RepeatableFormComponentDefinition,
    SimpleInputComponentDefinition
} from "../../src";



describe("Construct Visitor ", async () => {
    const chai = await import("chai");

    const cases: {
        args: FormConfigFrame;
        expected: FormConfig;
    }[] = [
        {
            // empty
            args: {},
            expected: new FormConfig({}),
        },
        {
            // simple example
            args: {
                componentDefinitions: [
                    {
                        name: 'repeatable_group_1',
                        model: {
                            class: 'RepeatableComponentModel',
                            config: {
                                defaultValue: [{ text_3: "hello world from repeating groups" }]
                            }
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    // first group component
                                    name: 'group_1_component',
                                    model: {
                                        class: 'GroupFieldModel',
                                        config: {
                                            defaultValue: {},
                                        }
                                    },
                                    component: {
                                        class: 'GroupFieldComponent',
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
                                                                    config: { minLength: 3 }
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
                                        class: 'RepeatableElementLayoutComponent',
                                        config: {
                                            hostCssClasses: 'row align-items-start'
                                        }
                                    },
                                }
                            },
                        },
                        layout: {
                            class: 'DefaultLayoutComponent',
                            config: {
                                label: 'Repeatable TextField not inside the tab with default wrapper defined',
                                helpText: 'Repeatable component help text',
                            }
                        },
                    }
                ]
            },
            expected: function () {
                const form = new FormConfig({});
                form.componentDefinitions = [
                    new RepeatableFormComponentDefinition()
                ]
                return form;
            }(),
        },
    ];
    cases.forEach(({ args, expected }) => {
        it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new ConstructFormConfigVisitor();
            const actual = visitor.constructFormConfig(args);
            chai.expect(actual).to.eql(expected);
        });
    });
});
