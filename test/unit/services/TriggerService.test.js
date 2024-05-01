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
                // caseSensitive: true, - default
                // allowNulls: true, - default
            };
            const result = await TriggerService.validateFieldUsingRegex(oid, record, options);
            expect(result).to.eql({'testing-field': [{'row-item': 'field-value'}]});
        });
        it('value with spaces fails when not trimmmed', async function () {
            const oid = "triggerservice-validateFieldUsingRegex-validpasses";
            const record = {'testing-field': [{'row-item': '  field-value  '}]};
            const options = {
                fieldDBName: 'testing-field',
                errorLanguageCode: "invalid-format",
                regexPattern: '^field-VALUE$',
                fieldLanguageCode: "title-required",
                arrayObjFieldDBName: 'row-item',
                trimLeadingAndTrailingSpacesBeforeValidation: false,
                caseSensitive: true,
                allowNulls: false,
            };
            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
            } catch (err) {
                expect(err).to.be.an('error');
                expect(err.name).to.eq("RBValidationError");
                expect(err.message).to.eq("Title is required Submission format is invalid");
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
            };

            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
            } catch (err) {
                expect(err).to.be.an('error');
                expect(err.name).to.eq("RBValidationError");
                expect(err.message).to.eq("Title is required Submission format is invalid");
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
            };
            try {
                await TriggerService.validateFieldUsingRegex(oid, record, options);
                expect.fail("Should have thrown error");
            } catch (err) {
                expect(err).to.be.an('error');
                expect(err.name).to.eq("RBValidationError");
                expect(err.message).to.eq("Title is required Submission format is invalid");
            }
        });
    });
});