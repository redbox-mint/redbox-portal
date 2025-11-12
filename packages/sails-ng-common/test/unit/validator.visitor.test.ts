import {ConstructFormConfigVisitor, FormConfigFrame, FormValidatorSummaryErrors} from "../../src";
import {ValidatorFormConfigVisitor} from "../../src/config/visitor/validator.visitor";
import {logger} from "./helpers";


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

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed, ["minimumCreate"]);
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

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed, ["transitionDraftToSubmitted"]);
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

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed, ["none"]);
        expect(actual).to.eql(expected);
    });
});
