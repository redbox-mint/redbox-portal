import {FormConfigFrame, FormValidatorSummaryErrors} from "../../src";
import {ValidatorFormConfigVisitor} from "../../src/config/visitor/validator.visitor";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validator Visitor", async () => {
    it(`should run only expected validators for initial membership none`, async function () {
        const args: FormConfigFrame = {
            name: "default-1.0-draft",
            componentDefinitions: [
                // TODO
            ]
        };
        const expected: FormValidatorSummaryErrors[] = [];
        const visitor = new ValidatorFormConfigVisitor();
        const actual = visitor.startNewRecord(args, ["minimumCreate"]);
        expect(actual).to.eql(expected);
    });
    it(`should run only expected validators for initial membership all`, async function () {
        const args: FormConfigFrame = {
            name: "default-1.0-draft",
            componentDefinitions: [
                // TODO
            ]
        };
        const expected: FormValidatorSummaryErrors[] = [];
        const visitor = new ValidatorFormConfigVisitor();
        const actual = visitor.startNewRecord(args, ["transitionDraftToSubmitted"]);
        expect(actual).to.eql(expected);
    });
    it(`should run expected validators for existing record`, async function () {
        const args: FormConfigFrame = {
            name: "default-1.0-draft",
            componentDefinitions: [
                // TODO
            ]
        };
        const expected: FormValidatorSummaryErrors[] = [];
        const visitor = new ValidatorFormConfigVisitor();
        const actual = visitor.startNewRecord(args, ["none"]);
        expect(actual).to.eql(expected);
    });
});