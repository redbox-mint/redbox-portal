import { Services as services } from '../CoreService';
import {
  recordSchema as defaultRecordSchemaConfig,
  type RecordSchemaConfigurationProblemReason,
  validateRecordSchemaConfig,
} from '../config/recordSchema.config';
import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  getDiscoveredRecordContractContributorComponentTypes,
  getDiscoveredRecordContractContributorRegistrationIssues,
  getDiscoveredRecordContractContributorRegistry,
  RECORD_CONTRACT_REGISTRATION_CODES,
  type RecordContractContributorRegistry,
  type RecordContractRegistrationCode,
  type RecordContractRegistrationIssue,
} from '../record-contract';
import {
  getMissingRecordSchemaStorageCapabilities,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  type RecordSchemaStorageCapabilityMethod,
} from '../StorageService';
import { RECORD_SCHEMA_PROBLEM_CODES } from '../record-contract/codes';

declare const RedboxJavaStorageService: unknown;

export const RECORD_SCHEMA_LIFECYCLE_ERROR_CODE = 'record-schema.lifecycle-failed' as const;

export type RecordSchemaPinProblemReason =
  | RecordSchemaConfigurationProblemReason
  | 'normalized-non-empty'
  | 'maximum-length'
  | 'digest'
  | 'schema-kind'
  | 'datetime';

export type RecordSchemaLifecycleFinding =
  | {
      readonly category: 'configuration';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID;
      readonly path: string;
      readonly reason: RecordSchemaConfigurationProblemReason | 'unreadable';
    }
  | {
      readonly category: 'storage';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE;
      readonly method: RecordSchemaStorageCapabilityMethod;
    }
  | {
      readonly category: 'contributor';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE;
      readonly registrationCode: RecordContractRegistrationCode;
      readonly key: string;
    }
  | {
      readonly category: 'coverage';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT;
      readonly componentType: string;
    }
  | {
      readonly category: 'pin';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID;
      readonly path: string;
      readonly reason: RecordSchemaPinProblemReason;
    };

interface RecordSchemaLifecycleDependencies {
  readonly getConfig: () => unknown;
  readonly getStorageProvider: () => unknown;
  readonly getContributorRegistry: () => RecordContractContributorRegistry | undefined;
  readonly getContributorRegistrationIssues: () => readonly RecordContractRegistrationIssue[];
  readonly getContributorComponentTypes: () => readonly string[];
}

const CATEGORY_ORDER: Readonly<Record<RecordSchemaLifecycleFinding['category'], number>> = {
  configuration: 0,
  storage: 1,
  contributor: 2,
  coverage: 3,
  pin: 4,
};

const DUPLICATE_REGISTRATION_CODES: ReadonlySet<RecordContractRegistrationCode> = new Set([
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_KEY,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_NAMESPACE,
]);

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_DIAGNOSTIC_IDENTIFIER = /^[A-Za-z0-9@._:/-]{1,200}$/;

function unreadableConfigurationFinding(): RecordSchemaLifecycleFinding {
  return {
    category: 'configuration',
    code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    path: 'recordSchema',
    reason: 'unreadable',
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuredRecordSchema(): unknown {
  return sails.config.recordSchema === undefined ? defaultRecordSchemaConfig : sails.config.recordSchema;
}

function configuredStorageProvider(): unknown {
  const storageConfig = sails.config.storage;
  if (isObjectRecord(storageConfig)) {
    const serviceName = storageConfig.serviceName;
    if (typeof serviceName === 'string' && serviceName.trim() !== '') {
      return sails.services?.[serviceName];
    }
  }
  return typeof RedboxJavaStorageService === 'undefined' ? undefined : RedboxJavaStorageService;
}

const DEFAULT_DEPENDENCIES: RecordSchemaLifecycleDependencies = {
  getConfig: configuredRecordSchema,
  getStorageProvider: configuredStorageProvider,
  getContributorRegistry: getDiscoveredRecordContractContributorRegistry,
  getContributorRegistrationIssues: getDiscoveredRecordContractContributorRegistrationIssues,
  getContributorComponentTypes: getDiscoveredRecordContractContributorComponentTypes,
};

function findingSortKey(finding: RecordSchemaLifecycleFinding): string {
  switch (finding.category) {
    case 'configuration':
      return `${finding.path}\u0000${finding.reason}`;
    case 'storage': {
      const methodIndex = RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.indexOf(finding.method);
      return `${String(methodIndex).padStart(2, '0')}\u0000${finding.method}`;
    }
    case 'contributor':
      return `${finding.registrationCode}\u0000${finding.key}`;
    case 'coverage':
      return finding.componentType;
    case 'pin':
      return `${finding.path}\u0000${finding.reason}`;
  }
}

function sortFindings(findings: readonly RecordSchemaLifecycleFinding[]): RecordSchemaLifecycleFinding[] {
  return [...findings].sort(
    (left, right) =>
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      compareText(findingSortKey(left), findingSortKey(right))
  );
}

function diagnosticIdentifier(value: string): string {
  return SAFE_DIAGNOSTIC_IDENTIFIER.test(value) ? value : '<invalid-identifier>';
}

function findingMessage(finding: RecordSchemaLifecycleFinding): string {
  switch (finding.category) {
    case 'configuration':
      return `${finding.code} [${finding.path}]: configuration is invalid (${finding.reason}).`;
    case 'storage':
      return `${finding.code} [${finding.method}]: required record-schema storage method is unavailable.`;
    case 'contributor':
      return `${finding.code} [${diagnosticIdentifier(finding.key)}]: contributor registration is invalid (${finding.registrationCode}).`;
    case 'coverage':
      return `${finding.code} [${finding.componentType}]: core component has no registered record-contract contributor.`;
    case 'pin':
      return `${finding.code} [${finding.path}]: configured integration pin is invalid (${finding.reason}).`;
  }
}

export class RecordSchemaLifecycleError extends Error {
  public readonly code = RECORD_SCHEMA_LIFECYCLE_ERROR_CODE;
  public readonly findings: readonly RecordSchemaLifecycleFinding[];

  public constructor(findings: readonly RecordSchemaLifecycleFinding[]) {
    const sorted = sortFindings(findings);
    super(
      `RecordSchemaService initialization failed with ${sorted.length} fatal finding(s):\n${sorted
        .map(finding => `- ${findingMessage(finding)}`)
        .join('\n')}`
    );
    this.name = 'RecordSchemaLifecycleError';
    this.findings = Object.freeze(sorted.map(finding => Object.freeze({ ...finding })));
  }
}

function configurationFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  const validation: ReturnType<typeof validateRecordSchemaConfig> = validateRecordSchemaConfig(value);
  if (validation.valid) {
    return [];
  }

  const rawPins = isObjectRecord(value) && Array.isArray(value.integrationPins) ? value.integrationPins : undefined;
  const findings: RecordSchemaLifecycleFinding[] = [];
  for (const problem of validation.problems) {
    if (!problem.path.startsWith('recordSchema.integrationPins')) {
      findings.push({
        category: 'configuration',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        path: problem.path,
        reason: problem.reason,
      });
      continue;
    }

    const itemMatch = /^recordSchema\.integrationPins\.(\d+)$/.exec(problem.path);
    if (itemMatch && rawPins && isObjectRecord(rawPins[Number(itemMatch[1])])) {
      continue;
    }
    findings.push({
      category: 'pin',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
      path: problem.path,
      reason: problem.reason,
    });
  }
  return findings;
}

function pinFinding(path: string, reason: RecordSchemaPinProblemReason): RecordSchemaLifecycleFinding {
  return {
    category: 'pin',
    code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    path,
    reason,
  };
}

function validatePinText(
  pin: Record<string, unknown>,
  index: number,
  property: string,
  maximumLength: number
): RecordSchemaLifecycleFinding[] {
  const path = `recordSchema.integrationPins.${index}.${property}`;
  const value = pin[property];
  if (value === undefined) {
    return [pinFinding(path, 'required')];
  }
  if (typeof value !== 'string') {
    return [pinFinding(path, 'type')];
  }
  if (value.length === 0 || value !== value.trim()) {
    return [pinFinding(path, 'normalized-non-empty')];
  }
  if (value.length > maximumLength) {
    return [pinFinding(path, 'maximum-length')];
  }
  return [];
}

function integrationPinFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  if (!isObjectRecord(value) || !Array.isArray(value.integrationPins)) {
    return [];
  }

  const findings: RecordSchemaLifecycleFinding[] = [];
  value.integrationPins.forEach((candidate, index) => {
    if (!isObjectRecord(candidate)) {
      return;
    }
    for (const property of ['digest', 'brand', 'portal', 'recordType', 'operation', 'owner'] as const) {
      findings.push(...validatePinText(candidate, index, property, 512));
    }
    findings.push(...validatePinText(candidate, index, 'purpose', 2_048));

    const digest = candidate.digest;
    if (typeof digest === 'string' && digest === digest.trim() && digest.length > 0 && !DIGEST_PATTERN.test(digest)) {
      findings.push(pinFinding(`recordSchema.integrationPins.${index}.digest`, 'digest'));
    }
    if (candidate.schemaKind !== 'create' && candidate.schemaKind !== 'update') {
      findings.push(
        pinFinding(
          `recordSchema.integrationPins.${index}.schemaKind`,
          candidate.schemaKind === undefined ? 'required' : 'schema-kind'
        )
      );
    }
    if (candidate.expiresAt !== undefined) {
      const expiresAt = candidate.expiresAt;
      if (
        typeof expiresAt !== 'string' ||
        expiresAt.length === 0 ||
        expiresAt !== expiresAt.trim() ||
        Number.isNaN(Date.parse(expiresAt))
      ) {
        findings.push(pinFinding(`recordSchema.integrationPins.${index}.expiresAt`, 'datetime'));
      }
    }
  });
  return findings;
}

function configuredFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  try {
    return [...configurationFindings(value), ...integrationPinFindings(value)];
  } catch {
    return [unreadableConfigurationFinding()];
  }
}

function storageFindings(provider: unknown): RecordSchemaLifecycleFinding[] {
  let missing: readonly RecordSchemaStorageCapabilityMethod[];
  try {
    missing = getMissingRecordSchemaStorageCapabilities(provider);
  } catch {
    missing = RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS;
  }
  return missing.map(method => ({
    category: 'storage',
    code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
    method,
  }));
}

function contributorFindings(issues: readonly RecordContractRegistrationIssue[]): RecordSchemaLifecycleFinding[] {
  return issues.map(issue => ({
    category: 'contributor',
    code: DUPLICATE_REGISTRATION_CODES.has(issue.code)
      ? RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE
      : RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
    registrationCode: issue.code,
    key: diagnosticIdentifier(issue.key),
  }));
}

function unavailableContributorStateIssue(): RecordContractRegistrationIssue {
  return {
    code: RECORD_CONTRACT_REGISTRATION_CODES.INVALID_EXPORT,
    key: 'registry',
    detail: 'Contributor discovery state is unavailable.',
  };
}

function coverageFindings(componentTypes: readonly string[]): RecordSchemaLifecycleFinding[] {
  const covered = new Set(componentTypes);
  return Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)
    .filter(componentType => !covered.has(componentType))
    .map(componentType => ({
      category: 'coverage',
      code: RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT,
      componentType,
    }));
}

function isDisabled(value: unknown): boolean {
  return isObjectRecord(value) && value.enabled === false;
}

export namespace Services {
  /** Performs the opt-in record-schema lifecycle gate without invoking persistence operations. */
  export class RecordSchema extends services.Core.Service {
    protected override _exportedMethods = ['init'];
    protected override logHeader = 'RecordSchemaService::';
    private readonly dependencies: RecordSchemaLifecycleDependencies;

    public constructor(overrides: Partial<RecordSchemaLifecycleDependencies> = {}) {
      super();
      this.dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    }

    public override init(): void {
      let config: unknown;
      let configReadFailed = false;
      try {
        config = this.dependencies.getConfig();
        if (isDisabled(config)) {
          return;
        }
      } catch {
        configReadFailed = true;
      }

      const findings: RecordSchemaLifecycleFinding[] = configReadFailed
        ? [unreadableConfigurationFinding()]
        : configuredFindings(config);

      let storageProvider: unknown;
      try {
        storageProvider = this.dependencies.getStorageProvider();
      } catch {
        storageProvider = undefined;
      }
      findings.push(...storageFindings(storageProvider));

      let contributorStateUnavailable = false;
      let registrationIssues: readonly RecordContractRegistrationIssue[] = [];
      try {
        registrationIssues = this.dependencies.getContributorRegistrationIssues();
      } catch {
        contributorStateUnavailable = true;
      }
      findings.push(...contributorFindings(registrationIssues));

      let registry: RecordContractContributorRegistry | undefined;
      try {
        registry = this.dependencies.getContributorRegistry();
      } catch {
        registry = undefined;
        contributorStateUnavailable = true;
      }
      if (!registry && registrationIssues.length === 0) {
        contributorStateUnavailable = true;
      }

      let componentTypes: readonly string[] = [];
      try {
        componentTypes = this.dependencies.getContributorComponentTypes();
      } catch {
        contributorStateUnavailable = true;
      }
      if (contributorStateUnavailable) {
        findings.push(...contributorFindings([unavailableContributorStateIssue()]));
      }
      findings.push(...coverageFindings(componentTypes));

      if (findings.length > 0) {
        throw new RecordSchemaLifecycleError(findings);
      }
      this.logger.verbose(`${this.logHeader} lifecycle checks passed.`);
    }
  }
}
