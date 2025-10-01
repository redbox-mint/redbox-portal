import {
    FormConfigFrame,
    TemplateCompileInput,
    TemplateFormConfigVisitor
} from "../../src";

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
    ];
    cases.forEach(({args, expected}) => {
        it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new TemplateFormConfigVisitor();
            const actual = visitor.start(args);
            expect(actual).to.eql(expected);
        });
    });
});
