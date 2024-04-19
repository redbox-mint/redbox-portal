// ref: https://sailsjs.com/docs/concepts/helpers

import {RBValidationError} from "@researchdatabox/redbox-core-types";

declare var _;
declare var TranslationService;

module.exports = {
    friendlyName: 'Validate regexp',
    description: 'Validate a record property using a regular expression.',
    inputs: {
        record: {
            type: 'ref',
            description: 'The record data.',
            required: true
        },
        fieldDBName: {
            type: 'string',
            description: 'The dotted path to the property in the record.',
            required: true,
        },
        errorLanguageCode: {
            type: 'string',
            description: 'The language code to obtain the main error message.',
            required: true,
        },
        regexPattern: {
            type: 'string',
            description: 'The regular expression for validating the property value.',
            required: true,
        },
        fieldLanguageCode: {
            type: 'string',
            description: 'The language code to obtain the error message for the field.',
            required: false,
        },
        arrayObjFieldDBName: {
            type: 'string',
            description: 'The dotted path to the property in the record, if the property is an array.',
            required: false,
            defaultsTo: undefined,
        },
        trimLeadingAndTrailingSpacesBeforeValidation: {
            //Set false by default if not present this option will remove leading and trailing spaces from a none array value
            //then it will modify the value in the record if the the regex validation is passed therefore handle with care
            type: 'boolean',
            description: 'Whether to trim whitespace at the start and end of the value.',
            required: false,
            defaultsTo: false,
        },
        caseSensitive: {
            type: 'boolean',
            description: 'Whether the regular expression is case sensitive.',
            required: false,
            defaultsTo: true,
        },
        allowNulls: {
            // default to true for backwards compatibility
            type: 'boolean',
            description: 'Whether to allow the value to be falsy.',
            required: false,
            defaultsTo: true,
        },
    },
    exits: {
        success: {
            description: 'All done.',
        },
        validationError: {
            description: 'The validation failed.',
        },
    },
    fn: async function (inputs, exits) {
        const textRegex = function (value) {
            let flags = '';
            if (inputs.caseSensitive) {
                flags += 'i';
            }
            const re = new RegExp(inputs.regexPattern, flags);
            return re.test(value);
        }
        const getError = function () {
            let customError: RBValidationError;
            if (inputs.fieldLanguageCode) {
                let fieldName = TranslationService.t(inputs.fieldLanguageCode);
                let baseErrorMessage = TranslationService.t(inputs.errorLanguageCode);
                customError = new RBValidationError(fieldName + ' ' + baseErrorMessage);
            } else {
                let baseErrorMessage = TranslationService.t(inputs.errorLanguageCode);
                customError = new RBValidationError(baseErrorMessage);
            }
            return customError;
        }
        const hasValue = function (data) {
            return data !== '' &&
                data !== null &&
                data !== undefined &&
                (data?.length !== undefined && data.length > 0);
        }
        const evaluate = function (element, fieldName) {
            let value = _.get(element, fieldName);

            if (inputs.trimLeadingAndTrailingSpacesBeforeValidation) {
                value = _.trim(value);
            }

            if (!hasValue(value) && !inputs.allowNulls) {
                return false;
            } else if (!hasValue(value) && inputs.allowNulls) {
                // this is ok
            } else if (!textRegex(value)) {
                return false;
            }

            if (inputs.trimLeadingAndTrailingSpacesBeforeValidation) {
                _.set(element, fieldName, value);
            }

            return true;
        }

        const data = _.get(inputs.record, inputs.fieldDBName);

        // early checks
        if (!hasValue(data) && !inputs.allowNulls) {
            return exits.validationError(getError());
        }
        if (!hasValue(data) && inputs.allowNulls) {
            return exits.success(inputs.record);
        }
        if (!_.isArray(data) && inputs.arrayObjFieldDBName) {
            return exits.validationError(getError());
        }
        if (_.isArray(data) && !inputs.arrayObjFieldDBName) {
            return exits.validationError(getError());
        }

        if (_.isArray(data)) {
            for (const row of data) {
                if (!evaluate(row, inputs.arrayObjFieldDBName)) {
                    return exits.validationError(getError());
                }
            }
        } else {
            if (!evaluate(inputs.record, inputs.fieldDBName)) {
                return exits.validationError(getError());
            }
        }

        return exits.success(inputs.record);
    },

};
