import {
    ConstructFormConfigVisitor,
    FormConfigFrame,
    TemplateCompileInput,
    TemplateFormConfigVisitor
} from "../../src";

import { formConfigExample1 } from "./example-data";
import { logger } from "./helpers";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Template Visitor", async () => {
    const cases: {
        title: string;
        args: FormConfigFrame;
        expected: TemplateCompileInput[];
    }[] = [
        {
            title: "create empty item",
            args: { name: "", componentDefinitions: [] },
            expected: []
        },
        {
            title: "create full example",
            args: formConfigExample1,
            expected: [
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "0", "component", "config", "template"],
                    kind: "handlebars",
                    value: '<h3>{{content}}</h3>',
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "10", "expressions", "0", "config", "template"],
                    kind: "jsonata",
                    value: `value & "__suffix"`,
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "12", "expressions", "0", "config", "template"],
                    kind: "jsonata",
                    value: `value = "hide text_2_component_event"`,
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "14", "expressions", "0", "config", "template"],
                    kind: "jsonata",
                    value: `value = "hide text_3_layout_event"`,
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "0", "expressions", "0", "config", "template"],
                    kind: "jsonata",
                    value: `value = "hide group_1_component"`,
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "1", "expressions", "0", "config", "template"],
                    kind: "jsonata",
                    value: `value = "hide repeatable_textfield_1"`,
                }
            ]
        },
        {
            title: "extract checkbox tree label template",
            args: {
                name: "test",
                componentDefinitions: [
                    {
                        name: "anzsrc",
                        component: {
                            class: "CheckboxTreeComponent",
                            config: {
                                labelTemplate: "{{notation}} - {{label}}"
                            }
                        },
                        model: { class: "CheckboxTreeModel", config: {} }
                    }
                ]
            },
            expected: [
                {
                    key: ["componentDefinitions", "0", "component", "config", "labelTemplate"],
                    kind: "handlebars",
                    value: "{{notation}} - {{label}}"
                }
            ]
        },
        {
            title: "extract typeahead label template",
            args: {
                name: "test",
                componentDefinitions: [
                    {
                        name: "person_lookup",
                        component: {
                            class: "TypeaheadInputComponent",
                            config: {
                                sourceType: "namedQuery",
                                queryId: "people",
                                labelTemplate: "{{raw.title}} ({{raw.code}})"
                            }
                        },
                        model: { class: "TypeaheadInputModel", config: {} }
                    }
                ]
            },
            expected: [
                {
                    key: ["componentDefinitions", "0", "component", "config", "labelTemplate"],
                    kind: "handlebars",
                    value: "{{raw.title}} ({{raw.code}})"
                }
            ]
        }
    ];

    cases.forEach(({ title, args, expected }) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start({ data: args, formMode: "edit" });

            const visitor = new TemplateFormConfigVisitor(logger);
            const actual = visitor.start({ form: constructed });

          expected.forEach((expectedItem, index) => {
            const actualItem = actual[index];
            expect(actualItem).to.not.eql(undefined, `index ${index}`);
            expect(actualItem.key).to.eql(expectedItem.key);
            expect(actualItem.kind).to.eql(expectedItem.kind);
            expect(actualItem.value).to.eql(expectedItem.value);
          });
        });
    });
});
