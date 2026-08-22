import { FormFieldValidationGroup, FormValidationGroups } from './form.model';
import { FormValidationGroupsChangeInitial } from './validation-groups';

/** @internal Shared client/server parity fixture. */
export interface ValidationGroupCalculationFixture {
  name: string;
  currentValidationGroups: string[];
  validationGroups: FormValidationGroups;
  initial?: FormValidationGroupsChangeInitial;
  groups?: FormFieldValidationGroup;
  operationEnabledValidationGroups?: string[];
  expectedGroups: string[];
  expectedDiagnosticCodes?: string[];
}

const availableGroups: FormValidationGroups = {
  all: { description: 'All validators', initialMembership: 'all' },
  none: { description: 'No validators', initialMembership: 'none' },
  draft: { description: 'Draft validators', initialMembership: 'none' },
  publish: { description: 'Publish validators', initialMembership: 'none' },
};

/**
 * Fixtures consumed by both sails-ng-common and Angular tests. They document
 * the deliberately retained edge cases as executable compatibility data.
 *
 * @internal
 */
export const validationGroupCalculationFixtures: ValidationGroupCalculationFixture[] = [
  {
    name: 'keeps an empty current group array',
    currentValidationGroups: [],
    validationGroups: availableGroups,
    expectedGroups: [],
  },
  {
    name: 'starts with every declared group in declaration order',
    currentValidationGroups: ['draft'],
    validationGroups: availableGroups,
    initial: 'all',
    expectedGroups: ['all', 'none', 'draft', 'publish'],
  },
  {
    name: 'starts with no groups',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    initial: 'none',
    expectedGroups: [],
  },
  {
    name: 'keeps current groups and applies include then exclude',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    groups: { include: ['draft', 'all'], exclude: ['all'] },
    expectedGroups: ['draft'],
  },
  {
    name: 'retains unknown group names for authoritative configuration checks',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    groups: { include: ['not-configured'] },
    expectedGroups: ['all', 'not-configured'],
  },
  {
    name: 'suppresses duplicate includes while preserving legacy current duplicates',
    currentValidationGroups: ['draft', 'draft'],
    validationGroups: availableGroups,
    groups: { include: ['draft', 'publish'], exclude: ['draft'] },
    expectedGroups: ['draft', 'publish'],
  },
  {
    name: 'supports the deprecated empty alias',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    initial: 'empty',
    expectedGroups: [],
    expectedDiagnosticCodes: ['validation-group-initial-empty-deprecated'],
  },
  {
    name: 'applies the operation exact group set last',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    initial: 'none',
    groups: { include: ['draft'] },
    operationEnabledValidationGroups: ['publish', 'publish'],
    expectedGroups: ['publish'],
  },
  {
    name: 'preserves an exact empty operation set',
    currentValidationGroups: ['all'],
    validationGroups: availableGroups,
    operationEnabledValidationGroups: [],
    expectedGroups: [],
  },
];
