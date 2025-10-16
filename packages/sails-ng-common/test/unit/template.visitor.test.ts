import {
    FormConfigFrame,
    TemplateCompileInput,
    TemplateFormConfigVisitor
} from "../../src";

// @ts-ignore
import {default as default_1_0_draft_form_config} from "./../../../../../form-config/default-1.0-draft.js";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Template Visitor", async () => {
    const cases: {
        args: FormConfigFrame;
        expected: TemplateCompileInput[];
    }[] = [
        {
            // empty
            args: {componentDefinitions: []},
            expected: [],
        },
        {
            args: default_1_0_draft_form_config,
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
    cases.forEach(({args, expected}) => {
        it(`should '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new TemplateFormConfigVisitor();
            const actual = visitor.start(args);

            actual.forEach((actualItem, index) => {
                const expectedItem = expected[index];
                expect(actualItem.key).to.eql(expectedItem.key);
                expect(actualItem.kind).to.eql(expectedItem.kind);
                expect(actualItem.value).to.be.a('string').and.satisfy((msg: string) => msg.startsWith(expectedItem.value));
            });
        });
    });
});
