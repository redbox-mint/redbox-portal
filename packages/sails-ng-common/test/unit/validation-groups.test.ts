import { calculateValidationGroups, ValidatorsSupport } from '../../src';
import { validationGroupCalculationFixtures } from '../../src/testing';

describe('validation-group calculation', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  for (const fixture of validationGroupCalculationFixtures) {
    it(fixture.name, function () {
      const result = calculateValidationGroups(
        fixture.currentValidationGroups,
        fixture.validationGroups,
        fixture.initial,
        fixture.groups,
        fixture.operationEnabledValidationGroups
      );

      expect(result.enabledValidationGroups).to.deep.equal(fixture.expectedGroups);
      expect(result.diagnostics.map(diagnostic => diagnostic.code)).to.deep.equal(
        fixture.expectedDiagnosticCodes ?? []
      );
    });
  }

  it('retains the legacy empty-array = all and configured none = no validators behavior', function () {
    const availableGroups = {
      all: { description: 'All validators', initialMembership: 'all' as const },
      none: { description: 'No validators', initialMembership: 'none' as const },
    };
    const validator = { class: 'required' };
    const support = new ValidatorsSupport();

    expect(support.isValidatorEnabled(availableGroups, [], validator)).to.equal(true);
    expect(support.isValidatorEnabled(availableGroups, ['none'], validator)).to.equal(false);
  });

  it('keeps an unknown runtime initial state unchanged and emits a safe diagnostic', function () {
    const result = calculateValidationGroups(
      ['all'],
      { all: { description: 'All validators', initialMembership: 'all' } },
      'invalid' as never
    );

    expect(result.enabledValidationGroups).to.deep.equal(['all']);
    expect(result.diagnostics).to.deep.equal([
      {
        code: 'validation-group-initial-unknown',
        severity: 'error',
        message: 'The validation-group initial state "invalid" is not supported.',
      },
    ]);
  });

  it('bounds unknown initial diagnostics without serializing object contents', function () {
    const longValue = 'x'.repeat(100);
    const longResult = calculateValidationGroups([], {}, longValue as never);
    const objectResult = calculateValidationGroups([], {}, { secret: 'must-not-leak' } as never);

    expect(longResult.diagnostics[0].message).to.equal(
      `The validation-group initial state "${'x'.repeat(64)}..." is not supported.`
    );
    expect(objectResult.diagnostics[0].message).to.equal(
      'The validation-group initial state [object] is not supported.'
    );
  });
});
