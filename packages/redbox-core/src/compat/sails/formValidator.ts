import { ValidatorFormConfigVisitor } from '../../forms/ValidatorFormConfigVisitor';
import type { ILogger } from '@researchdatabox/sails-ng-common';
export class LegacyFormValidator extends ValidatorFormConfigVisitor {
  constructor(log: ILogger) {
    super(log, {
      sanitizeWithProfile: (value, profile) => DomSanitizerService.sanitizeWithProfile(value, profile),
      htmlSanitizationMode: () => sails.config.record?.form?.htmlSanitizationMode ?? 'sanitize',
    });
  }
}
