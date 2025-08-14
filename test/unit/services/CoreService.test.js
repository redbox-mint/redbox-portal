const coreTypes = require('@researchdatabox/redbox-core-types');
describe('The CoreService', function () {

    // Create a class for testing
    class TestCoreService extends coreTypes.Services.Core.Service {
        metTriggerCondition(oid, record, options, user) {
            return super.metTriggerCondition(oid, record, options, user);
        }
    }
    const testCoreService = new TestCoreService();

    before(function (done) {
        done();
    });

    describe('metTriggerCondition', function () {

        it("should have expected result with basic args", function (done) {
            expect(testCoreService.metTriggerCondition()).to.eql("false");
            expect(testCoreService.metTriggerCondition("")).to.eql("false");
            expect(testCoreService.metTriggerCondition("", {})).to.eql("false");
            expect(testCoreService.metTriggerCondition(undefined, undefined, undefined, undefined)).to.eql("false");

            done();
        });

        describe("forceRun cases", function () {
            [
                {args: {oid: "", record: {}, options: {forceRun: true}}, expected: "true"},
                {args: {oid: "", record: {}, options: {}}, expected: "false"},
                {
                    args: {
                        oid: "",
                        record: {metadata: {testing: true}},
                        options: {triggerCondition: "<%= record.metadata.testing == true %>"}
                    }, expected: "true"
                },
                {
                    args: {
                        oid: "",
                        record: {metadata: {testing: false}},
                        options: {forceRun: true, triggerCondition: "<%= record.metadata.testing == true %>"}
                    }, expected: "false"
                },
                {
                    args: {
                        oid: "",
                        record: {metadata: {testing: false}},
                        options: {forceRun: false, triggerCondition: "<%= record.metadata.testing == true %>"}
                    }, expected: "false"
                },
                {
                    args: {
                        oid: "",
                        record: {metadata: {testing: true}},
                        options: {forceRun: false, triggerCondition: "<%= record.metadata.testing == true %>"}
                    }, expected: "true"
                },
                {
                    args: {
                        oid: "oid-1",
                        record: {metadata: {testing: true}},
                        options: {forceRun: false, triggerCondition: "<%= oid ==='oid-1' && record.metadata.testing == true %>"}
                    }, expected: "true"
                },
            ].forEach(({args, expected}) => {
                it(`should run when expected '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, function (done) {
                    expect(testCoreService.metTriggerCondition(args.oid, args.record, args.options)).to.eql(expected);

                    done();
                });
            });
        });

        describe("user cases", function () {
            [
                {args: {oid: "", record: {}, options: {forceRun: true}, user: undefined}, expected: "true"},
                {args: {oid: "", record: {}, options: {}, user: undefined}, expected: "false"},
                {
                    args: {
                        oid: "",
                        record: {},
                        options: {triggerCondition: "<%= user.username == 'testing-user' %>"},
                        user: {username: 'testing-user'}
                    }, expected: "true"
                },
                {
                    args: {
                        oid: "",
                        record: {},
                        options: {triggerCondition: "<%= user.username == 'testing-user' %>"},
                        user: {username: 'testing-user-no-match'}
                    }, expected: "false"
                },
            ].forEach(({args, expected}) => {
                it(`should run when expected '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, function (done) {
                    expect(testCoreService.metTriggerCondition(args.oid, args.record, args.options, args.user)).to.eql(expected);

                    done();
                });
            });
        });

    });
});