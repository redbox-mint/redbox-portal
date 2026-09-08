import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_MISMATCH_CATEGORIES,
  AUTHORIZATION_MISMATCH_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP,
  AUTHORIZATION_MISMATCH_LEGACY_CLASSIFICATIONS,
  isApprovedMismatchClassification,
  isMismatchClassification,
  mismatchClassificationCategory,
  type AuthorizationMismatchClassification,
} from '../../src/authorization/shadow-classification';
import {
  ALL_SHADOW_CLASSIFICATION_FIXTURES,
  LEGACY_SHADOW_CLASSIFICATION_FIXTURES,
  SHADOW_CLASSIFICATION_FIXTURES,
} from '../fixtures/authorization-shadow-classification.fixtures';

describe('shadow mismatch classification contract', () => {
  it('keeps the compile-time vocabulary closed', () => {
    // @ts-expect-error Arbitrary labels must not widen the persisted classification union.
    const invalid: AuthorizationMismatchClassification = 'arbitrary-label';
    assert.equal(isMismatchClassification(invalid), false);
  });

  it('covers exactly six required categories and every explicit legacy mapping', () => {
    assert.equal(SHADOW_CLASSIFICATION_FIXTURES.length, 6);
    assert.deepEqual(
      SHADOW_CLASSIFICATION_FIXTURES.map(row => row.classification),
      AUTHORIZATION_MISMATCH_CATEGORIES
    );
    assert.deepEqual(
      ALL_SHADOW_CLASSIFICATION_FIXTURES.map(row => row.classification),
      AUTHORIZATION_MISMATCH_CLASSIFICATIONS
    );
    assert.deepEqual(
      Object.keys(AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP),
      AUTHORIZATION_MISMATCH_LEGACY_CLASSIFICATIONS
    );
    for (const { classification, category } of LEGACY_SHADOW_CLASSIFICATION_FIXTURES) {
      assert.equal(mismatchClassificationCategory(classification), category);
    }
    for (const { classification } of SHADOW_CLASSIFICATION_FIXTURES) {
      assert.equal(mismatchClassificationCategory(classification), classification);
    }
  });

  for (const { classification, resolves } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
    it(`${classification} ${resolves ? 'requires recorded approval to resolve' : 'requires remediation and remains a blocker'}`, () => {
      assert.equal(isMismatchClassification(classification), true);
      assert.equal(isApprovedMismatchClassification(classification), resolves);
    });
  }

  it('never approves missing, unknown, or inherited property labels', () => {
    for (const label of [undefined, null, '', 'arbitrary-label', 'toString', '__proto__', 'Needs-Investigation']) {
      assert.equal(isMismatchClassification(label), false);
      assert.equal(isApprovedMismatchClassification(label), false);
    }
  });
});
