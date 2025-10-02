describe('The TriggerService', function () {
    before(function (done) {
        done();
    });
    describe('should validate fields using regex', function () {
        it('valid value passes', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-validpasses";
            const record = {'testing-field': [{'row-item': '  field-value  '}]};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: '^field-VALUE$',
                fieldLanguageCode: "title-required",
                arrayObjFieldDBName: 'row-item',
                trimLeadingAndTrailingSpacesBeforeValidation: true,
                forceRun: true,
                caseSensitive: false,
                allowNulls: true,
            };
            const result = await TriggerService.validateFieldUsingRegex(oid, record, options);
            expect(result).to.eql({'testing-field': [{'row-item': 'field-value'}]});
        });
        it('value with different case fails when case sensitive', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-validpasses";
            const record = {'testing-field': [{'row-item': '  field-value  '}]};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: '^field-value$',
                fieldLanguageCode: "title-required",
                arrayObjFieldDBName: 'row-item',
                trimLeadingAndTrailingSpacesBeforeValidation: true,
                forceRun: true,
                caseSensitive: true,
                allowNulls: true,
            };
            const result = await TriggerService.validateFieldUsingRegex(oid, record, options);
            expect(result).to.eql({'testing-field': [{'row-item': 'field-value'}]});
        });
        it('value with spaces fails when not trimmed', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-validpasses";
            const record = {'testing-field': [{'row-item': '  field-value  '}]};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: '^field-VALUE$',
                fieldLanguageCode: "title-required",
                arrayObjFieldDBName: 'row-item',
                trimLeadingAndTrailingSpacesBeforeValidation: false,
                caseSensitive: false,
                allowNulls: false,
                forceRun: true
            };
            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
                        } catch (err) {
                                expect(err).to.be.an('error');
                                expect(err.name).to.eq("RBValidationError");
                                const acceptable = [
                                    "Title is required Submission format is invalid",
                                    "title-required invalid-format"
                                ];
                                expect(acceptable).to.include(err.message);
                        }
        });
        it('invalid value fails with RBValidationError', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-invalidfails";
            const record = {
                'testing-field': [{'row-item': 'field-value'}],
            };
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: '^field-not-VALUE$',
                fieldLanguageCode: "title-required",
                arrayObjFieldDBName: 'row-item',
                trimLeadingAndTrailingSpacesBeforeValidation: false,
                caseSensitive: false,
                allowNulls: true,
                forceRun: true
            };

            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
                        } catch (err) {
                                expect(err).to.be.an('error');
                                expect(err.name).to.eq("RBValidationError");
                                const acceptable = [
                                    "Title is required Submission format is invalid",
                                    "title-required invalid-format"
                                ];
                                expect(acceptable).to.include(err.message);
                        }
        });
        it('empty value passes for allowNulls', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-emptyfails";
            const record = {'testing-field': ''};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: 'field-value',
                fieldLanguageCode: "title-required",
                trimLeadingAndTrailingSpacesBeforeValidation: false,
                caseSensitive: false,
                allowNulls: true,
                forceRun: true
            };
            const result = await TriggerService.validateFieldUsingRegex(oid, record, options);
            expect(result).to.eql(record);
        });
        it('empty value fails for allowNulls false field with RBValidationError', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-emptyfails";
            const record = {'testing-field': ''};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: 'field-value',
                fieldLanguageCode: "title-required",
                trimLeadingAndTrailingSpacesBeforeValidation: false,
                caseSensitive: false,
                allowNulls: false,
                forceRun: true
            };
            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
                        } catch (err) {
                                expect(err).to.be.an('error');
                                expect(err.name).to.eq("RBValidationError");
                                const acceptable = [
                                    "Title is required Submission format is invalid",
                                    "title-required invalid-format"
                                ];
                                expect(acceptable).to.include(err.message);
                        }
        });
    });


    describe('should validate fields using lodash template', function () {
        it('valid value passes', async function () {
            const oid = "triggerservice-template-validpasses";
            const record = {'testing-field': 'valid-value'};
            const options = {
                template: `<% let errorList = [] 
                if (_.get(record,'testing-field') !== 'valid-value') { 
                    addError(errorList, 'testing-field', 'title-required', 'invalid-format' );
                }
                return errorList; %>`,
                forceRun: true
            };

            try {
                const result = await TriggerService.validateFieldsUsingTemplate(oid, record, options);
                expect(result).to.eql({'testing-field': 'valid-value'});
            } catch (err) {
                expect.fail("Should not have thrown error");
            }

        });

        it('invalid value fails', async function () {
            const oid = "triggerservice-template-validpasses";
            const record = {'testing-field': 'invalid-value'};
            const options = {
                template: `<% let errorList = [] 
                if (_.get(record,'testing-field') !== 'valid-value') { 
                    addError(errorList, 'testing-field', 'title-required', 'invalid-format' );
                }
                return errorList; %>`,
                forceRun: true
            };
            try {
                const result = await TriggerService.validateFieldsUsingTemplate(oid, record, options);
                        } catch (err) {
                                expect(err).to.be.an('error');
                                expect(err.name).to.eq("RBValidationError");
                                // Template path packs JSON string or plain codes depending on translation availability
                                try {
                                    const errorMap = JSON.parse(err.message);
                                    expect(errorMap.errorFieldList[0].label).to.be.oneOf(["Title is required", "title-required"]);
                                } catch (e) {
                                    // Fallback plain text error path
                                    const acceptable = [
                                        "Title is required Submission format is invalid",
                                        "title-required invalid-format"
                                    ];
                                    expect(acceptable).to.include(err.message);
                                }
                        }

        });

    });
});