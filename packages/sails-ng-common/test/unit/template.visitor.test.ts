import {FormConfig, FormConfigOutline, TemplateFormConfigVisitor} from "../../src";


describe("Template Visitor", async () => {
    const chai = await import("chai");

    const cases: {
        args: FormConfigOutline;
        expected: FormConfigOutline;
    }[] = [
        {
            // empty
            args: new FormConfig(),
            expected: new FormConfig(),
        },
    ];
    cases.forEach(({args, expected}) => {
        it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new TemplateFormConfigVisitor();
            const actual = visitor.start(args);
            chai.expect(actual).to.eql(expected);
        });
    });
});
