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
                        value: "<h3>"
                    },
                    {
                        key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "10", "expressions", "model.value", "template"],
                        kind: "jsonata",
                        value: "<%= _.get(model,'text_1_event',"
                    },
                    {
                        key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "12", "expressions", "component.visible", "template"],
                        kind: "jsonata",
                        value: "<% if(_.isEmpty(_.get(model,'text_2_event'"
                    },
                    {
                        key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "14", "expressions", "layout.visible", "template"],
                        kind: "jsonata",
                        value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
                    },
                    {
                        key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "0", "expressions", "layout.visible", "template"],
                        kind: "jsonata",
                        value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
                    },
                    {
                        key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "1", "expressions", "layout.visible", "template"],
                        kind: "jsonata",
                        value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
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

            actual.forEach((actualItem, index) => {
                const expectedItem = expected[index];
                expect(actualItem.key).to.eql(expectedItem.key);
                expect(actualItem.kind).to.eql(expectedItem.kind);
                expect(actualItem.value)
                    .to.be.a("string")
                    .and.satisfy((msg: string) => msg.startsWith(expectedItem.value));
            });
        });
    });
});
