import type { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

import type {
  ContractNode,
  ContractObjectNode,
  RecordContractDiagnostic,
  RecordContractPointer,
  RecordContractPublicContext,
} from './types';
import { isRecordContractPointer, recordContractPointer, recordContractPointersOverlap } from './json-pointer';

export type RecordContractContributorNullability = 'non-null' | 'nullable' | 'configuration';

export interface RecordContractCompileChildrenOptions {
  readonly definitionKey?: string;
}

export interface RecordContractContributorCompileContext {
  readonly component: Readonly<FormComponentDefinitionFrame>;
  readonly pointer: RecordContractPointer;
  readonly publicContext: RecordContractPublicContext;
  compileChildren(
    components: readonly FormComponentDefinitionFrame[],
    parent: RecordContractPointer,
    options?: RecordContractCompileChildrenOptions
  ): Promise<ContractObjectNode>;
}

export type RecordContractComponentContribution =
  | {
      readonly kind: 'node';
      readonly node: ContractNode;
      readonly diagnostics?: readonly RecordContractDiagnostic[];
    }
  | {
      readonly kind: 'non-persisting';
      readonly children?: readonly FormComponentDefinitionFrame[];
    };

interface RecordContractContributorBase {
  readonly key: string;
  readonly version: string;
  readonly nullability: RecordContractContributorNullability;
}

export interface RecordContractComponentContributor extends RecordContractContributorBase {
  readonly kind: 'component';
  readonly componentType: string;
  /** RFC 6901 pointers relative to the component's form-owned field root. */
  readonly ownedPointers: readonly string[];
  compile(
    context: RecordContractContributorCompileContext
  ): RecordContractComponentContribution | Promise<RecordContractComponentContribution>;
}

export type RecordContractContributor = RecordContractComponentContributor;

export interface RecordContractContributorRegistration {
  readonly contributor: RecordContractContributor;
  readonly source: 'core' | 'hook';
  readonly packageName?: string;
}

export const RECORD_CONTRACT_REGISTRATION_CODES = {
  INVALID_KEY: 'record-contract.registration.invalid-key',
  INVALID_VERSION: 'record-contract.registration.invalid-version',
  INVALID_COMPONENT_TYPE: 'record-contract.registration.invalid-component-type',
  INVALID_POINTER: 'record-contract.registration.invalid-pointer',
  DUPLICATE_KEY: 'record-contract.registration.duplicate-key',
  DUPLICATE_COMPONENT: 'record-contract.registration.duplicate-component',
  OVERLAPPING_ROOT: 'record-contract.registration.overlapping-root',
  INVALID_EXPORT: 'record-contract.registration.invalid-export',
} as const;

export type RecordContractRegistrationCode =
  (typeof RECORD_CONTRACT_REGISTRATION_CODES)[keyof typeof RECORD_CONTRACT_REGISTRATION_CODES];

export interface RecordContractRegistrationIssue {
  readonly code: RecordContractRegistrationCode;
  readonly key: string;
  readonly detail: string;
}

export class RecordContractContributorRegistrationError extends Error {
  public readonly issues: readonly RecordContractRegistrationIssue[];

  public constructor(issues: readonly RecordContractRegistrationIssue[]) {
    const sorted = sortRegistrationIssues(issues);
    super(
      `Invalid record-contract contributor registrations:\n${sorted
        .map(issue => `- ${issue.code} [${issue.key}]: ${issue.detail}`)
        .join('\n')}`
    );
    this.name = 'RecordContractContributorRegistrationError';
    this.issues = Object.freeze(sorted.map(item => Object.freeze({ ...item })));
  }
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:/-]*$/;
const STABLE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COMPONENT_TYPE = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

function sortRegistrationIssues(issues: readonly RecordContractRegistrationIssue[]): RecordContractRegistrationIssue[] {
  return [...issues].sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.key.localeCompare(right.key) ||
      left.detail.localeCompare(right.detail)
  );
}

function registrationSortKey(registration: RecordContractContributorRegistration): string {
  const contributor = registration.contributor;
  return `${contributor.componentType}:${contributor.key}:${registration.packageName ?? ''}`;
}

function immutableRegistration(
  registration: RecordContractContributorRegistration
): RecordContractContributorRegistration {
  const contributor = Object.freeze({
    ...registration.contributor,
    ownedPointers: Object.freeze([...registration.contributor.ownedPointers]),
  });

  return Object.freeze({
    contributor,
    source: registration.source,
    ...(registration.packageName === undefined ? {} : { packageName: registration.packageName }),
  });
}

function issue(code: RecordContractRegistrationCode, key: string, detail: string): RecordContractRegistrationIssue {
  return { code, key, detail };
}

export interface RecordContractContributorRegistryOptions {
  readonly additionalIssues?: readonly RecordContractRegistrationIssue[];
}

/** Immutable, deterministically ordered registry validated at its construction boundary. */
export class RecordContractContributorRegistry {
  readonly #registrations: readonly RecordContractContributorRegistration[];
  readonly #components: ReadonlyMap<string, RecordContractContributorRegistration>;

  public constructor(
    registrations: readonly RecordContractContributorRegistration[],
    options: RecordContractContributorRegistryOptions = {}
  ) {
    const ordered = registrations
      .map(immutableRegistration)
      .sort((left, right) => registrationSortKey(left).localeCompare(registrationSortKey(right)));
    const issues = [...(options.additionalIssues ?? [])];
    const keys = new Map<string, RecordContractContributorRegistration>();
    const components = new Map<string, RecordContractContributorRegistration>();

    for (const registration of ordered) {
      const contributor = registration.contributor;
      const key = contributor.key.trim();
      if (!STABLE_KEY.test(key)) {
        issues.push(
          issue(RECORD_CONTRACT_REGISTRATION_CODES.INVALID_KEY, contributor.key, 'Expected a stable lowercase key.')
        );
      }
      if (!STABLE_VERSION.test(contributor.version)) {
        issues.push(
          issue(
            RECORD_CONTRACT_REGISTRATION_CODES.INVALID_VERSION,
            contributor.key,
            'Expected a non-blank stable version.'
          )
        );
      }
      if (keys.has(key)) {
        issues.push(
          issue(RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_KEY, key, 'Contributor key is already registered.')
        );
      } else {
        keys.set(key, registration);
      }

      if (!COMPONENT_TYPE.test(contributor.componentType)) {
        issues.push(
          issue(
            RECORD_CONTRACT_REGISTRATION_CODES.INVALID_COMPONENT_TYPE,
            contributor.key,
            `Invalid component type ${JSON.stringify(contributor.componentType)}.`
          )
        );
      }
      if (components.has(contributor.componentType)) {
        issues.push(
          issue(
            RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
            contributor.componentType,
            'Component type is already registered.'
          )
        );
      } else {
        components.set(contributor.componentType, registration);
      }
      if (contributor.ownedPointers.length === 0) {
        issues.push(
          issue(
            RECORD_CONTRACT_REGISTRATION_CODES.INVALID_POINTER,
            contributor.key,
            'A component contributor must declare at least one owned pointer.'
          )
        );
      }
      const owned: RecordContractPointer[] = [];
      for (const pointer of contributor.ownedPointers) {
        if (!isRecordContractPointer(pointer)) {
          issues.push(
            issue(
              RECORD_CONTRACT_REGISTRATION_CODES.INVALID_POINTER,
              contributor.key,
              `Invalid relative owned pointer ${JSON.stringify(pointer)}.`
            )
          );
        } else if (owned.some(existing => recordContractPointersOverlap(existing, pointer))) {
          issues.push(
            issue(
              RECORD_CONTRACT_REGISTRATION_CODES.OVERLAPPING_ROOT,
              contributor.key,
              `Owned pointer ${JSON.stringify(pointer)} overlaps another owned pointer.`
            )
          );
        } else {
          owned.push(recordContractPointer(pointer));
        }
      }
    }

    if (issues.length > 0) {
      throw new RecordContractContributorRegistrationError(issues);
    }

    this.#registrations = Object.freeze(ordered);
    this.#components = components;
  }

  public registrations(): readonly RecordContractContributorRegistration[] {
    return this.#registrations;
  }

  public component(componentType: string): RecordContractContributorRegistration | undefined {
    return this.#components.get(componentType);
  }
}

export interface RecordContractContributorDiscoveryState {
  readonly registrations: readonly RecordContractContributorRegistration[];
  readonly registrationIssues: readonly RecordContractRegistrationIssue[];
  readonly componentTypes: readonly string[];
}

export function recordContractContributorDiscoveryState(
  registrations: readonly RecordContractContributorRegistration[],
  registrationIssues: readonly RecordContractRegistrationIssue[] = []
): RecordContractContributorDiscoveryState {
  return Object.freeze({
    registrations: Object.freeze([...registrations]),
    registrationIssues: Object.freeze(
      sortRegistrationIssues(registrationIssues).map(item => Object.freeze({ ...item }))
    ),
    componentTypes: Object.freeze(
      [...new Set(registrations.map(registration => registration.contributor.componentType))].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    ),
  });
}
