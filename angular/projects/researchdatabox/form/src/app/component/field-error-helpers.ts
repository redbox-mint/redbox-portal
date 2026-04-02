import { FormValidatorComponentErrors } from '@researchdatabox/sails-ng-common';

export function getPrimaryError(errors: FormValidatorComponentErrors[] | null | undefined): FormValidatorComponentErrors | null {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }
  return errors[0];
}

export function getAdditionalErrorCount(errors: FormValidatorComponentErrors[] | null | undefined): number {
  if (!Array.isArray(errors) || errors.length <= 1) {
    return 0;
  }
  return errors.length - 1;
}

export function hasMultipleErrors(errors: FormValidatorComponentErrors[] | null | undefined): boolean {
  return getAdditionalErrorCount(errors) > 0;
}
