import type { AuthorizationMismatchCategory } from '../../src/authorization/shadow-classification';

/** Synthetic triage decisions, never product/security approval of a deployment. */
export const SHADOW_CLASSIFICATION_FIXTURES = [
  {
    classification: 'mapping-defect',
    disposition: 'remediation-required',
    remediation: 'Correct the role-to-scope mapping and rerun the affected role/route comparison.',
    resolves: false,
  },
  {
    classification: 'data-migration-drift-defect',
    disposition: 'remediation-required',
    remediation: 'Repair migrated assignments or drift and rerun migration and request evidence.',
    resolves: false,
  },
  {
    classification: 'missing-route-declaration',
    disposition: 'remediation-required',
    remediation: 'Declare the route authorization and rerun route inventory and direct-route parity.',
    resolves: false,
  },
  {
    classification: 'resource-gate-defect',
    disposition: 'remediation-required',
    remediation: 'Repair the resource/brand gate and rerun resource denial and opacity regressions.',
    resolves: false,
  },
  {
    classification: 'approved-legacy-security-bug',
    disposition: 'external-approval-required',
    remediation: 'Record the security approval and a regression proving the intentional security correction.',
    resolves: true,
  },
  {
    classification: 'intentional-product-change',
    disposition: 'external-approval-required',
    remediation: 'Record the product approval and a regression proving the intentional behavior change.',
    resolves: true,
  },
] as const satisfies readonly {
  classification: AuthorizationMismatchCategory;
  disposition: 'remediation-required' | 'external-approval-required';
  remediation: string;
  resolves: boolean;
}[];

export const LEGACY_SHADOW_CLASSIFICATION_FIXTURES = [
  { classification: 'approved-security-difference', category: 'approved-legacy-security-bug', resolves: true },
  { classification: 'expected-legacy-gap', category: 'intentional-product-change', resolves: true },
  { classification: 'scope-declaration-fix-required', category: 'missing-route-declaration', resolves: false },
  { classification: 'needs-investigation', category: 'data-migration-drift-defect', resolves: false },
] as const;

export const ALL_SHADOW_CLASSIFICATION_FIXTURES = [
  ...SHADOW_CLASSIFICATION_FIXTURES,
  ...LEGACY_SHADOW_CLASSIFICATION_FIXTURES,
] as const;
