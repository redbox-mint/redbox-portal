import {ClientFormConfigVisitor, FormConfig, FormConfigFrame} from "../../src";

// @ts-ignore
import {default as default_1_0_draft_form_config}from "./../../../../../form-config/default-1.0-draft.js";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
    const cases: {
        args: FormConfigFrame;
        expected: FormConfigFrame;
    }[] = [
        {
            // empty
            args: {name: '', componentDefinitions: []},
            expected: new FormConfig(),
        },
        {
            args: default_1_0_draft_form_config,
            expected: {name: '', componentDefinitions: []},
        }
    ];
    cases.forEach(({args, expected}) => {
        it(`should '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new ClientFormConfigVisitor();
            const actual = visitor.start(args);
            expect(actual).to.eql(expected);
        });
    });
});

