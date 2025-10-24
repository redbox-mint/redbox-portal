import {
    ConstructFormConfigVisitor,
    FormConfigFrame,
    TemplateCompileInput,
    TemplateFormConfigVisitor
} from "../../src";

import {formConfigExample1, reusableDefinitionsExample1} from "./example-data";
import {logger} from "./helpers";

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
            args: {name: "", componentDefinitions: []},
            expected: [],
        },
        {
            title: "create full example",
            args: formConfigExample1,
            expected: [
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "0", "component", "config", "template"],
                    kind: "handlebars", value: "<h3>"
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "10", "expressions", "model.value", "template"],
                    kind: "jsonata", value: "<%= _.get(model,'text_1_event',"
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "12", "expressions", "component.visible", "template"],
                    kind: "jsonata", value: "<% if(_.isEmpty(_.get(model,'text_2_event'"
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "0", "component", "config", "componentDefinitions", "14", "expressions", "layout.visible", "template"],
                    kind: "jsonata", value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "0", "expressions", "layout.visible", "template"],
                    kind: "jsonata", value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
                },
                {
                    key: ["componentDefinitions", "0", "component", "config", "tabs", "1", "component", "config", "componentDefinitions", "1", "expressions", "layout.visible", "template"],
                    kind: "jsonata", value: "<% if(_.isEmpty(_.get(model,'text_3_event'"
                },
            ],
        }
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start(args);

            const visitor = new TemplateFormConfigVisitor(logger);
            const actual = visitor.start(constructed);

            actual.forEach((actualItem, index) => {
                const expectedItem = expected[index];
                expect(actualItem.key).to.eql(expectedItem.key);
                expect(actualItem.kind).to.eql(expectedItem.kind);
                expect(actualItem.value).to.be.a('string').and.satisfy((msg: string) => msg.startsWith(expectedItem.value));
            });
        });
    });
});
