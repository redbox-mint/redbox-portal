import type { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

import type {
  ContractJsonValue,
  ContractNode,
  ContractObjectNode,
  RecordContractDiagnostic,
  RecordContractPointer,
  RecordContractPublicContext,
} from './types';
import { isRecordContractPointer, recordContractPointer, recordContractPointersOverlap } from './json-pointer';

export type RecordContractContributorNullability = 'non-null' | 'nullable' | 'configuration' | 'legacy-permissive';

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

export interface RecordContractExtensionCompileContext {
  readonly namespace: string;
  readonly root: RecordContractPointer;
  readonly metadata: ContractJsonValue | undefined;
  readonly publicContext: RecordContractPublicContext;
}

export type RecordContractExtensionContribution = {
  readonly node: ContractNode;
  readonly diagnostics?: readonly RecordContractDiagnostic[];
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

export interface RecordContractExtensionContributor extends RecordContractContributorBase {
  readonly kind: 'extension';
  readonly namespace: string;
  readonly root: RecordContractPointer;
  compile(
    context: RecordContractExtensionCompileContext
  ): RecordContractExtensionContribution | Promise<RecordContractExtensionContribution>;
}

export type RecordContractContributor = RecordContractComponentContributor | RecordContractExtensionContributor;

export interface RecordContractContributorRegistration {
  readonly contributor: RecordContractContributor;
  readonly source: 'core' | 'hook';
  readonly packageName?: string;
}

export const RECORD_CONTRACT_REGISTRATION_CODES = {
  INVALID_KEY: 'record-contract.registration.invalid-key',
  INVALID_VERSION: 'record-contract.registration.invalid-version',
  INVALID_COMPONENT_TYPE: 'record-contract.registration.invalid-component-type',
  INVALID_NAMESPACE: 'record-contract.registration.invalid-namespace',
  INVALID_POINTER: 'record-contract.registration.invalid-pointer',
  DUPLICATE_KEY: 'record-contract.registration.duplicate-key',
  DUPLICATE_COMPONENT: 'record-contract.registration.duplicate-component',
  DUPLICATE_NAMESPACE: 'record-contract.registration.duplicate-namespace',
  OVERLAPPING_ROOT: 'record-contract.registration.overlapping-root',
  FORM_PATH_OVERWRITE: 'record-contract.registration.form-path-overwrite',
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
const EXTENSION_NAMESPACE = /^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9][A-Za-z0-9._~-]*$/;

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
  const target = contributor.kind === 'component' ? contributor.componentType : contributor.namespace;
  return `${contributor.kind}:${target}:${contributor.key}:${registration.packageName ?? ''}`;
}

function immutableRegistration(
  registration: RecordContractContributorRegistration
): RecordContractContributorRegistration {
  const contributor =
    registration.contributor.kind === 'component'
      ? Object.freeze({
          ...registration.contributor,
          ownedPointers: Object.freeze([...registration.contributor.ownedPointers]),
        })
      : Object.freeze({ ...registration.contributor });

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
  /** Exact form-owned roots that extension contributors may not replace. */
  readonly formOwnedRoots?: readonly RecordContractPointer[];
  readonly additionalIssues?: readonly RecordContractRegistrationIssue[];
}

/** Immutable, deterministically ordered registry validated at its construction boundary. */
export class RecordContractContributorRegistry {
  readonly #registrations: readonly RecordContractContributorRegistration[];
  readonly #components: ReadonlyMap<string, RecordContractContributorRegistration>;
  readonly #extensions: readonly RecordContractContributorRegistration[];

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
    const namespaces = new Map<string, RecordContractContributorRegistration>();
    const extensionRoots: Array<{
      root: RecordContractPointer;
      registration: RecordContractContributorRegistration;
    }> = [];

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

      if (contributor.kind === 'component') {
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
      } else {
        if (!EXTENSION_NAMESPACE.test(contributor.namespace)) {
          issues.push(
            issue(
              RECORD_CONTRACT_REGISTRATION_CODES.INVALID_NAMESPACE,
              contributor.key,
              `Invalid extension namespace ${JSON.stringify(contributor.namespace)}.`
            )
          );
        }
        if (!isRecordContractPointer(contributor.root) || contributor.root === '') {
          issues.push(
            issue(
              RECORD_CONTRACT_REGISTRATION_CODES.INVALID_POINTER,
              contributor.key,
              'Extension root must be a non-root RFC 6901 pointer.'
            )
          );
        }
        if (namespaces.has(contributor.namespace)) {
          issues.push(
            issue(
              RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_NAMESPACE,
              contributor.namespace,
              'Extension namespace is already registered.'
            )
          );
        } else {
          namespaces.set(contributor.namespace, registration);
        }
        for (const existing of extensionRoots) {
          if (recordContractPointersOverlap(existing.root, contributor.root)) {
            issues.push(
              issue(
                RECORD_CONTRACT_REGISTRATION_CODES.OVERLAPPING_ROOT,
                contributor.key,
                `Extension root ${contributor.root} overlaps ${existing.root}.`
              )
            );
          }
        }
        for (const formRoot of options.formOwnedRoots ?? []) {
          if (recordContractPointersOverlap(formRoot, contributor.root)) {
            issues.push(
              issue(
                RECORD_CONTRACT_REGISTRATION_CODES.FORM_PATH_OVERWRITE,
                contributor.key,
                `Extension root ${contributor.root} overlaps form-owned root ${formRoot}.`
              )
            );
          }
        }
        extensionRoots.push({ root: recordContractPointer(contributor.root), registration });
      }
    }

    if (issues.length > 0) {
      throw new RecordContractContributorRegistrationError(issues);
    }

    this.#registrations = Object.freeze(ordered);
    this.#components = components;
    this.#extensions = Object.freeze(ordered.filter(item => item.contributor.kind === 'extension'));
  }

  public registrations(): readonly RecordContractContributorRegistration[] {
    return this.#registrations;
  }

  public component(componentType: string): RecordContractContributorRegistration | undefined {
    return this.#components.get(componentType);
  }

  public extensions(): readonly RecordContractContributorRegistration[] {
    return this.#extensions;
  }
}

let discoveredContributorRegistry: RecordContractContributorRegistry | undefined;
let discoveredContributorRegistrationIssues: readonly RecordContractRegistrationIssue[] = Object.freeze([]);
let discoveredContributorComponentTypes: readonly string[] = Object.freeze([]);

function componentTypesFromRegistrations(
  registrations: readonly RecordContractContributorRegistration[]
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        registrations.flatMap(registration =>
          registration.contributor.kind === 'component' ? [registration.contributor.componentType] : []
        )
      ),
    ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  );
}

export function setDiscoveredRecordContractContributorRegistry(registry: RecordContractContributorRegistry): void {
  discoveredContributorRegistry = registry;
  discoveredContributorRegistrationIssues = Object.freeze([]);
  discoveredContributorComponentTypes = componentTypesFromRegistrations(registry.registrations());
}

export function getDiscoveredRecordContractContributorRegistry(): RecordContractContributorRegistry | undefined {
  return discoveredContributorRegistry;
}

export function setDiscoveredRecordContractContributorRegistrationIssues(
  issues: readonly RecordContractRegistrationIssue[],
  registrations: readonly RecordContractContributorRegistration[] = []
): void {
  discoveredContributorRegistry = undefined;
  discoveredContributorRegistrationIssues = Object.freeze(
    sortRegistrationIssues(issues).map(item => Object.freeze({ ...item }))
  );
  discoveredContributorComponentTypes = componentTypesFromRegistrations(registrations);
}

export function getDiscoveredRecordContractContributorRegistrationIssues(): readonly RecordContractRegistrationIssue[] {
  return discoveredContributorRegistrationIssues;
}

/** Component coverage retained even when other registrations prevent construction of the full registry. */
export function getDiscoveredRecordContractContributorComponentTypes(): readonly string[] {
  return discoveredContributorComponentTypes;
}

export function resetDiscoveredRecordContractContributorRegistry(): void {
  discoveredContributorRegistry = undefined;
  discoveredContributorRegistrationIssues = Object.freeze([]);
  discoveredContributorComponentTypes = Object.freeze([]);
}
