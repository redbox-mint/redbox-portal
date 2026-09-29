import { expect } from 'chai';

import {
  RecordContractContributorRegistry,
  RecordContractContributorRegistrationError,
  RECORD_CONTRACT_REGISTRATION_CODES,
} from '../../../src';
import type { RecordContractComponentContributor, RecordContractContributorRegistration } from '../../../src';

function component(
  key: string,
  componentType: string,
  ownedPointers: readonly string[] = ['']
): RecordContractComponentContributor {
  return {
    kind: 'component',
    key,
    version: '1',
    componentType,
    ownedPointers,
    nullability: 'non-null',
    compile: () => ({ kind: 'node', node: { kind: 'scalar', nullable: false, scalarType: 'string' } }),
  };
}

function registration(
  contributor: RecordContractComponentContributor,
  source: 'core' | 'hook' = 'hook'
): RecordContractContributorRegistration {
  return { contributor, source, ...(source === 'hook' ? { packageName: '@test/hook' } : {}) };
}

describe('RecordContractContributorRegistry', function () {
  it('sorts component registrations independently of hook load order', function () {
    const registrations = [
      registration(component('hook.z-component', 'ZComponent')),
      registration(component('hook.a-component', 'AComponent')),
    ];

    const forward = new RecordContractContributorRegistry(registrations);
    const reverse = new RecordContractContributorRegistry([...registrations].reverse());

    expect(forward.registrations().map(item => item.contributor.key)).to.deep.equal(
      reverse.registrations().map(item => item.contributor.key)
    );
    expect(forward.component('AComponent')?.contributor.key).to.equal('hook.a-component');
  });

  it('snapshots and freezes contributor definitions at the runtime registry boundary', function () {
    const original = component('hook.immutable', 'ImmutableComponent', ['/child', '/sibling']);
    const registry = new RecordContractContributorRegistry([registration(original)]);
    const stored = registry.component('ImmutableComponent');

    expect(stored).not.to.equal(undefined);
    expect(Object.isFrozen(stored)).to.equal(true);
    expect(Object.isFrozen(stored?.contributor)).to.equal(true);
    if (stored?.contributor.kind === 'component') {
      expect(Object.isFrozen(stored.contributor.ownedPointers)).to.equal(true);
      expect(Reflect.set(stored.contributor, 'componentType', 'MutatedComponent')).to.equal(false);
      expect(Reflect.set(stored.contributor.ownedPointers, '0', '/mutated')).to.equal(false);
    }

    expect(Reflect.set(original, 'componentType', 'ChangedAfterRegistration')).to.equal(true);
    const retained = registry.component('ImmutableComponent')?.contributor;
    expect(retained?.kind).to.equal('component');
    if (retained?.kind === 'component') {
      expect(retained.componentType).to.equal('ImmutableComponent');
    }
    expect(registry.component('ChangedAfterRegistration')).to.equal(undefined);
  });

  it('aggregates and stably sorts invalid keys, versions, types, duplicates, and owned paths', function () {
    const invalid = component('Blank Key', '', []);
    const invalidVersion = { ...component('hook.invalid-version', 'InvalidVersionComponent'), version: ' ' };
    const duplicateA = component('hook.duplicate-a', 'DuplicateComponent', ['', '/child']);
    const duplicateB = component('hook.duplicate-b', 'DuplicateComponent');

    let thrown: RecordContractContributorRegistrationError | undefined;
    try {
      new RecordContractContributorRegistry([
        registration(invalidVersion),
        registration(duplicateB),
        registration(invalid),
        registration(duplicateA),
      ]);
    } catch (error) {
      thrown = error as RecordContractContributorRegistrationError;
    }

    expect(thrown).to.be.instanceOf(RecordContractContributorRegistrationError);
    expect(thrown?.issues.map(item => item.code)).to.include.members([
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_KEY,
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_VERSION,
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_COMPONENT_TYPE,
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_POINTER,
      RECORD_CONTRACT_REGISTRATION_CODES.OVERLAPPING_ROOT,
      RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
    ]);
    expect(thrown?.issues).to.deep.equal(
      [...(thrown?.issues ?? [])].sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          left.key.localeCompare(right.key) ||
          left.detail.localeCompare(right.detail)
      )
    );
  });
});
