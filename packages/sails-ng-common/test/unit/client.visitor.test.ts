import {ClientFormConfigVisitor, FormConfigFrame} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
    const cases: {
        args: FormConfigFrame;
        expected: FormConfigFrame;
    }[] = [
        {
            // empty
            args: {
                componentDefinitions: []
            },
            expected: {
                componentDefinitions: []
            },
        },
    ];
    cases.forEach(({args, expected}) => {
        it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new ClientFormConfigVisitor();
            const actual = visitor.start(args);
            expect(actual).to.eql(expected);
        });
    });
});

