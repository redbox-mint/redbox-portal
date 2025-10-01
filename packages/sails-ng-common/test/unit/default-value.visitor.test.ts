import {ClientFormConfigVisitor, DefaultValueFormConfigVisitor, FormConfig, FormConfigOutline} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {

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
            const visitor = new DefaultValueFormConfigVisitor();
            const actual = visitor.start(args);
            expect(actual).to.eql(expected);
        });
    });
});
