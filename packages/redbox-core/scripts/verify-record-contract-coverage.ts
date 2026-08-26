import { promises as fs } from 'fs';
import path from 'path';

import type { FormConfigFrame, ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';

import { recordSchema, type RecordSchemaLimitsConfig } from '../src/config/recordSchema.config';
import { reusableFormDefinitions } from '../src/config/reusableFormDefinitions.config';
import { FormConfigExports as CoreFormConfigExports } from '../src/form-config';
import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  type CoreRecordContractComponentClassification,
} from '../src/record-contract/core-contributors';
import {
  RecordContractContributorRegistry,
  type RecordContractContributorRegistration,
} from '../src/record-contract/contributor-registry';
import { RecordContractCompiler } from '../src/record-contract/record-contract-compiler';
import { renderRecordJsonSchema } from '../src/record-contract/json-schema-renderer';
import {
  compileRecordJsonSchemaArtifact,
  RecordJsonSchemaCompilationError,
} from '../src/record-contract/record-json-schema-artifact';
import type { RecordContractPublicContext, RecordContractSchemaKind } from '../src/record-contract/types';

const DevHookDataRecordForm = (
  require('../../redbox-hook-dev/src/form-config/dataRecord-1.0-draft') as { readonly default: FormConfigFrame }
).default;

const APPROVED_SNAPSHOT_PATH = path.resolve(__dirname, '../test/snapshots/record-contract-coverage.json');
const APPROVED_SNAPSHOT_MAX_BYTES = 64 * 1024;
const MAX_COVERAGE_FORMS = 20;
const COVERAGE_FORM_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const PERSISTED_COMPONENT_CLASSIFICATIONS = new Set<CoreRecordContractComponentClassification>([
  'array',
  'object',
  'scalar',
  'specialized',
]);

export interface RecordContractCoverageForm {
  readonly id: string;
  readonly form: FormConfigFrame;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
}

export interface RecordContractCoverageSnapshotEntry {
  readonly form: string;
  readonly kind: RecordContractSchemaKind;
  readonly digest: string;
  readonly byteLength: number;
  readonly completeness: 'complete' | 'partial';
}

export interface RecordContractCoverageSnapshot {
  readonly version: 1;
  readonly schemas: readonly RecordContractCoverageSnapshotEntry[];
}

export interface RecordContractCoverageReport {
  readonly formsChecked: number;
  readonly schemasChecked: number;
  readonly persistedCoreComponentsCovered: number;
}

export type RecordContractCoverageErrorCode =
  | 'record-contract-coverage.compiler-limit-exceeded'
  | 'record-contract-coverage.invalid-schema'
  | 'record-contract-coverage.nondeterministic-output'
  | 'record-contract-coverage.stale-snapshot'
  | 'record-contract-coverage.uncovered-persisted-component';

export class RecordContractCoverageError extends Error {
  public constructor(
    public readonly code: RecordContractCoverageErrorCode,
    message: string,
    public readonly target?: string
  ) {
    super(message);
    this.name = 'RecordContractCoverageError';
  }
}

export interface RecordContractCoverageOptions {
  readonly forms?: readonly RecordContractCoverageForm[];
  readonly registrations?: readonly RecordContractContributorRegistration[];
  readonly limits?: Readonly<RecordSchemaLimitsConfig>;
  readonly approvedSnapshot?: RecordContractCoverageSnapshot;
  readonly approvedSnapshotPath?: string;
}

const DEFAULT_FORMS: readonly RecordContractCoverageForm[] = Object.freeze([
  Object.freeze({
    id: 'core/generated-view-only',
    form: CoreFormConfigExports['generated-view-only'],
    reusableFormDefinitions,
  }),
  Object.freeze({
    id: 'dev-hook/dataRecord-1.0-draft',
    form: DevHookDataRecordForm,
  }),
]);

function defaultRegistrations(): readonly RecordContractContributorRegistration[] {
  return createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }));
}

function persistedCoreComponentTypes(): readonly string[] {
  return Object.entries(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)
    .filter(([, classification]) => PERSISTED_COMPONENT_CLASSIFICATIONS.has(classification))
    .map(([componentType]) => componentType)
    .sort((left, right) => left.localeCompare(right));
}

function assertPersistedCoreCoverage(registrations: readonly RecordContractContributorRegistration[]): number {
  const covered = new Set(
    registrations.flatMap(registration =>
      registration.source === 'core' && registration.contributor.kind === 'component'
        ? [registration.contributor.componentType]
        : []
    )
  );
  const persisted = persistedCoreComponentTypes();
  const missing = persisted.filter(componentType => !covered.has(componentType));
  if (missing.length > 0) {
    throw new RecordContractCoverageError(
      'record-contract-coverage.uncovered-persisted-component',
      'A persisted core component has no core record-contract contributor.',
      missing[0]
    );
  }
  return persisted.length;
}

function assertCoverageForms(forms: readonly RecordContractCoverageForm[]): void {
  if (forms.length === 0 || forms.length > MAX_COVERAGE_FORMS) {
    throw new Error('The record-contract coverage form count is outside the supported range.');
  }
  const ids = new Set<string>();
  for (const form of forms) {
    if (!COVERAGE_FORM_ID.test(form.id) || ids.has(form.id)) {
      throw new Error('Record-contract coverage form identifiers must be unique and stable.');
    }
    ids.add(form.id);
  }
}

function contextFor(
  coverageForm: RecordContractCoverageForm,
  kind: RecordContractSchemaKind
): RecordContractPublicContext {
  return {
    brand: 'ci',
    portal: 'contract-coverage',
    kind,
    recordType: coverageForm.form.type || coverageForm.form.name,
    workflowStep: 'draft',
    form: coverageForm.form.name,
    operation: 'strict-all',
    unknownProperties: 'declared',
    enforcement: 'enforce',
  };
}

async function compileCoverageSchema(
  coverageForm: RecordContractCoverageForm,
  kind: RecordContractSchemaKind,
  registry: RecordContractContributorRegistry,
  limits: Readonly<RecordSchemaLimitsConfig>
) {
  const result = await new RecordContractCompiler(registry, limits).compile({
    form: coverageForm.form,
    context: contextFor(coverageForm, kind),
    ...(coverageForm.reusableFormDefinitions ? { reusableFormDefinitions: coverageForm.reusableFormDefinitions } : {}),
  });
  if (result.kind !== 'compiled') {
    if (result.failureKind === 'limit-exceeded') {
      throw new RecordContractCoverageError(
        'record-contract-coverage.compiler-limit-exceeded',
        'A configured form exceeds the record-contract compiler limits.',
        `${coverageForm.id}:${kind}`
      );
    }
    throw new Error(`Configured form compilation failed for ${coverageForm.id}:${kind}.`);
  }
  try {
    return compileRecordJsonSchemaArtifact(renderRecordJsonSchema(result.contract), {
      maxDocumentBytes: limits.maxDocumentBytes,
      maxValidationErrors: limits.maxDiagnostics,
    });
  } catch (error) {
    if (error instanceof RecordJsonSchemaCompilationError) {
      throw new RecordContractCoverageError(
        'record-contract-coverage.invalid-schema',
        'A generated record JSON Schema does not satisfy the configured schema contract.',
        `${coverageForm.id}:${kind}`
      );
    }
    throw error;
  }
}

function snapshotText(snapshot: RecordContractCoverageSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

async function readApprovedSnapshot(snapshotPath: string): Promise<RecordContractCoverageSnapshot> {
  const metadata = await fs.stat(snapshotPath);
  if (metadata.size > APPROVED_SNAPSHOT_MAX_BYTES) {
    throw new Error('The approved record-contract coverage snapshot exceeds its size limit.');
  }
  const value = await fs.readFile(snapshotPath, 'utf8');
  if (Buffer.byteLength(value, 'utf8') > APPROVED_SNAPSHOT_MAX_BYTES) {
    throw new Error('The approved record-contract coverage snapshot exceeds its size limit.');
  }
  return JSON.parse(value) as RecordContractCoverageSnapshot;
}

export async function generateRecordContractCoverageSnapshot(
  options: Omit<RecordContractCoverageOptions, 'approvedSnapshot' | 'approvedSnapshotPath'> = {}
): Promise<RecordContractCoverageSnapshot> {
  const forms = options.forms ?? DEFAULT_FORMS;
  const registrations = options.registrations ?? defaultRegistrations();
  const limits = options.limits ?? recordSchema.limits;
  assertCoverageForms(forms);
  assertPersistedCoreCoverage(registrations);
  const registry = new RecordContractContributorRegistry(registrations);
  const schemas: RecordContractCoverageSnapshotEntry[] = [];

  for (const coverageForm of [...forms].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const kind of ['create', 'update'] as const) {
      const first = await compileCoverageSchema(coverageForm, kind, registry, limits);
      const second = await compileCoverageSchema(coverageForm, kind, registry, limits);
      if (first.canonicalJson !== second.canonicalJson) {
        throw new RecordContractCoverageError(
          'record-contract-coverage.nondeterministic-output',
          'Repeated compilation produced different canonical record JSON Schemas.',
          `${coverageForm.id}:${kind}`
        );
      }
      schemas.push({
        form: coverageForm.id,
        kind,
        digest: first.digest,
        byteLength: first.byteLength,
        completeness: first.document['x-redbox-completeness'],
      });
    }
  }

  return Object.freeze({ version: 1, schemas: Object.freeze(schemas.map(entry => Object.freeze(entry))) });
}

export async function runRecordContractCoverage(
  options: RecordContractCoverageOptions = {}
): Promise<RecordContractCoverageReport> {
  const registrations = options.registrations ?? defaultRegistrations();
  const generated = await generateRecordContractCoverageSnapshot({
    ...(options.forms ? { forms: options.forms } : {}),
    registrations,
    ...(options.limits ? { limits: options.limits } : {}),
  });
  const approved =
    options.approvedSnapshot ?? (await readApprovedSnapshot(options.approvedSnapshotPath ?? APPROVED_SNAPSHOT_PATH));
  if (snapshotText(generated) !== snapshotText(approved)) {
    throw new RecordContractCoverageError(
      'record-contract-coverage.stale-snapshot',
      'Generated record-contract output does not match the approved deterministic snapshot.',
      path.basename(options.approvedSnapshotPath ?? APPROVED_SNAPSHOT_PATH)
    );
  }

  return Object.freeze({
    formsChecked: options.forms?.length ?? DEFAULT_FORMS.length,
    schemasChecked: generated.schemas.length,
    persistedCoreComponentsCovered: assertPersistedCoreCoverage(registrations),
  });
}

async function main(): Promise<void> {
  try {
    const report = await runRecordContractCoverage();
    process.stdout.write(
      `Record-contract coverage passed: ${report.formsChecked} forms, ${report.schemasChecked} schemas, ${report.persistedCoreComponentsCovered} persisted core components.\n`
    );
  } catch (error) {
    const failure =
      error instanceof RecordContractCoverageError
        ? `${error.code}${error.target ? ` [${error.target}]` : ''}: ${error.message}`
        : 'record-contract-coverage.unexpected: Record-contract coverage failed.';
    process.stderr.write(`${failure.slice(0, 512)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
