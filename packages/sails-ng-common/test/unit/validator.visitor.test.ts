import {cloneDeep as _cloneDeep} from "lodash";
import {
    ConstructFormConfigVisitor,
    FormConfigFrame,
    formValidatorsSharedDefinitions,
    FormValidatorSummaryErrors
} from "../../src";
import {ValidatorFormConfigVisitor} from "../../src/config/visitor/validator.visitor";
import {logger} from "./helpers";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Validator Visitor", async () => {
    const exampleFormConfig: FormConfigFrame = {
        name: "default-1.0-draft",
        validationGroups: {
            all: {
                description: "Validate all fields with validators.",
                initialMembership: "all"
            },
            none: {
                description: "Validate none of the fields.",
                initialMembership: "none",
            },
            minimumCreate: {
                description: "Fields that must be valid to create a new record.",
                initialMembership: "none",
            },
            transitionDraftToSubmitted: {
                description: "Fields that must be valid to transition from draft to submitted.",
                initialMembership: "all",
            },
        },
        componentDefinitions: [
            {
                name: 'text_7',
                layout: {
                    class: 'DefaultLayout',
                    config: {
                        label: 'TextField with default wrapper defined',
                        helpText: 'This is a help text',
                    }
                },
                model: {
                    class: 'SimpleInputModel',
                    config: {
                        defaultValue: 'hello world 2!',
                        validators: [
                            {
                                name: 'pattern',
                                config: {
                                    pattern: /prefix.*/,
                                    description: "must start with prefix"
                                },
                                groups: {include: ['minimumCreate']},
                            },
                            {
                                name: 'minLength',
                                message: "@validator-error-custom-text_7",
                                config: {minLength: 3}
                            },
                        ]
                    }
                },
                component: {
                    class: 'SimpleInputComponent'
                }
            },
        ]
    };

    it(`should run only expected validators for initial membership none`, async function () {
        const args = _cloneDeep(exampleFormConfig);
        const expected: FormValidatorSummaryErrors[] = [];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed, ["minimumCreate"], formValidatorsSharedDefinitions);
        expect(actual).to.eql(expected);
    });
    it(`should run only expected validators for initial membership all`, async function () {
        const args = _cloneDeep(exampleFormConfig);
        const expected: FormValidatorSummaryErrors[] = [];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed, ["transitionDraftToSubmitted"], formValidatorsSharedDefinitions);
        expect(actual).to.eql(expected);
    });
    it(`should run expected validators for existing record`, async function () {
        const args = _cloneDeep(exampleFormConfig);
        const record = {};
        const expected: FormValidatorSummaryErrors[] = [];

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ValidatorFormConfigVisitor(logger);
        const actual = visitor.startExistingRecord(constructed, ["all"], formValidatorsSharedDefinitions, record);
        expect(actual).to.eql(expected);
    });
});
