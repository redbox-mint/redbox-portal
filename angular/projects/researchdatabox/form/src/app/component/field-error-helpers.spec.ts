import { FormValidatorComponentErrors } from '@researchdatabox/sails-ng-common';
import { getAdditionalErrorCount, getPrimaryError, hasMultipleErrors } from './field-error-helpers';

describe('field-error-helpers', () => {
  const errors: FormValidatorComponentErrors[] = [
    { class: 'required', message: '@validator-error-required', params: { required: true } },
    { class: 'maxlength', message: '@validator-error-maxlength', params: { requiredLength: 3 } },
  ];

  it('getPrimaryError should return first error or null', () => {
    expect(getPrimaryError(errors)).toEqual(errors[0]);
    expect(getPrimaryError([])).toBeNull();
    expect(getPrimaryError(undefined)).toBeNull();
  });

  it('getAdditionalErrorCount should return additional count', () => {
    expect(getAdditionalErrorCount(errors)).toBe(1);
    expect(getAdditionalErrorCount([errors[0]])).toBe(0);
    expect(getAdditionalErrorCount(undefined)).toBe(0);
  });

  it('hasMultipleErrors should return true only when count > 1', () => {
    expect(hasMultipleErrors(errors)).toBeTrue();
    expect(hasMultipleErrors([errors[0]])).toBeFalse();
    expect(hasMultipleErrors(undefined)).toBeFalse();
  });
});
