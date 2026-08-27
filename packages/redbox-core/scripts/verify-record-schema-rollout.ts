import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { FormConfigFrame, ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';

import { recordSchema, type RecordSchemaLimitsConfig } from '../src/config/recordSchema.config';
import { recordValidation } from '../src/config/recordValidation.config';
import { reusableFormDefinitions } from '../src/config/reusableFormDefinitions.config';
import { createCoreRecordContractContributors } from '../src/record-contract/core-contributors';
import {
  RecordContractContributorRegistry,
  type RecordContractComponentContributor,
  type RecordContractContributorRegistration,
} from '../src/record-contract/contributor-registry';
import { RecordContractCompiler } from '../src/record-contract/record-contract-compiler';
import { renderRecordJsonSchema } from '../src/record-contract/json-schema-renderer';
import { compileRecordJsonSchemaArtifact } from '../src/record-contract/record-json-schema-artifact';
import type { ContractNode, RecordContractDiagnostic, RecordContractSchemaKind } from '../src/record-contract/types';

const DevHookFormConfigExports = (
  require('../../redbox-hook-dev/src/form-config') as {
    readonly FormConfigExports: Readonly<Record<string, FormConfigFrame>>;
  }
).FormConfigExports;

const APPROVED_REPORT_PATH = path.resolve(__dirname, '../test/snapshots/record-schema-shadow-rollout.json');
const MAX_REPORT_BYTES = 64 * 1024;
const MAX_FORMS = 20;
const MAX_FINDINGS = 200;
const FORM_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const UNKNOWN_PROPERTY_PROBE = '__record_schema_rollout_unknown_property__';

export interface RecordSchemaRolloutEvidenceForm {
  readonly id: string;
  readonly form: FormConfigFrame;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
}

export interface RecordSchemaRolloutEvidenceFinding {
  readonly form: string;
  readonly code: string;
  readonly kinds: readonly RecordContractSchemaKind[];
  readonly pointer?: string;
  readonly componentType?: string;
}

export interface RecordSchemaRolloutLegacyNullabilityFinding {
  readonly form: string;
  readonly kinds: readonly RecordContractSchemaKind[];
  readonly pointer: string;
  readonly componentType: string;
}

export interface RecordSchemaRolloutEvidenceEntry {
  readonly form: string;
  readonly kind: RecordContractSchemaKind;
  readonly digest: string;
  readonly completeness: 'complete' | 'partial';
  readonly byteLength: number;
  readonly observedNodeDepth: number;
  readonly observedProperties: number;
  readonly diagnosticCount: number;
  readonly diagnosticCodes: readonly string[];
  readonly legacyNullabilityCount: number;
  readonly unknownPropertyProbe: 'accepted';
  readonly shadowWarningCodes: readonly string[];
}

export interface RecordSchemaRolloutEvidenceReport {
  readonly version: 1;
  readonly defaults: {
    readonly recordSchemaEnabled: false;
    readonly recordValidationMode: 'shadow';
    readonly unknownProperties: 'allow';
  };
  readonly shadowRun: {
    readonly recordSchemaEnabled: true;
    readonly recordValidationMode: 'shadow';
    readonly unknownProperties: 'allow';
  };
  readonly bounds: {
    readonly maxForms: number;
    readonly maxSchemas: number;
    readonly maxFindings: number;
    readonly maxReportBytes: number;
  };
  readonly summary: {
    readonly formsChecked: number;
    readonly schemasChecked: number;
    readonly completeSchemas: number;
    readonly partialSchemas: number;
    readonly unsupportedComponents: number;
    readonly legacyNullability: number;
    readonly schemaWarnings: number;
    readonly unknownPropertyProbesAccepted: number;
  };
  readonly limitHeadroom: {
    readonly cacheEntries: LimitHeadroom;
    readonly maxDepth: LimitHeadroom;
    readonly maxProperties: LimitHeadroom;
    readonly maxDocumentBytes: LimitHeadroom;
    readonly maxDiagnostics: LimitHeadroom;
    readonly contributorTimeoutMs: {
      readonly limit: number;
      readonly breaches: 0;
    };
  };
  readonly unsupportedComponents: readonly RecordSchemaRolloutEvidenceFinding[];
  readonly legacyNullability: readonly RecordSchemaRolloutLegacyNullabilityFinding[];
  readonly schemaDiagnostics: readonly RecordSchemaRolloutEvidenceFinding[];
  readonly schemas: readonly RecordSchemaRolloutEvidenceEntry[];
}

interface LimitHeadroom {
  readonly limit: number;
  readonly observedMaximum: number;
  readonly remaining: number;
}

interface NodeMetrics {
  readonly depth: number;
  readonly properties: number;
}

interface MutableFinding {
  readonly form: string;
  readonly code: string;
  readonly kinds: Set<RecordContractSchemaKind>;
  readonly pointer?: string;
  readonly componentType?: string;
}

interface MutableLegacyFinding {
  readonly form: string;
  readonly kinds: Set<RecordContractSchemaKind>;
  readonly pointer: string;
  readonly componentType: string;
}

export type RecordSchemaRolloutEvidenceErrorCode =
  | 'record-schema-rollout.defaults-changed'
  | 'record-schema-rollout.invalid-form-set'
  | 'record-schema-rollout.compile-failed'
  | 'record-schema-rollout.unknown-property-rejected'
  | 'record-schema-rollout.shadow-warning-missing'
  | 'record-schema-rollout.too-many-findings'
  | 'record-schema-rollout.report-too-large'
  | 'record-schema-rollout.stale-report';

export class RecordSchemaRolloutEvidenceError extends Error {
  public constructor(
    public readonly code: RecordSchemaRolloutEvidenceErrorCode,
    message: string,
    public readonly target?: string
  ) {
    super(message);
    this.name = 'RecordSchemaRolloutEvidenceError';
  }
}

export interface RecordSchemaRolloutEvidenceOptions {
  readonly forms?: readonly RecordSchemaRolloutEvidenceForm[];
  readonly registrations?: readonly RecordContractContributorRegistration[];
  readonly limits?: Readonly<RecordSchemaLimitsConfig>;
  readonly approvedReport?: RecordSchemaRolloutEvidenceReport;
  readonly approvedReportPath?: string;
}

const DEFAULT_FORMS: readonly RecordSchemaRolloutEvidenceForm[] = Object.freeze(
  Object.entries(DevHookFormConfigExports)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, form]) =>
      Object.freeze({
        id: `dev-hook/${id}`,
        form,
        reusableFormDefinitions,
      })
    )
);

function defaultRegistrations(): readonly RecordContractContributorRegistration[] {
  return createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }));
}

function assertSafeDefaults(): void {
  if (
    recordSchema.enabled !== false ||
    recordSchema.unknownProperties !== 'allow' ||
    recordValidation.mode !== 'shadow'
  ) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.defaults-changed',
      'Record-schema rollout evidence requires disabled/allow/shadow framework defaults.'
    );
  }
}

function assertForms(forms: readonly RecordSchemaRolloutEvidenceForm[]): void {
  if (forms.length === 0 || forms.length > MAX_FORMS) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.invalid-form-set',
      'The rollout evidence form count is outside the supported bound.'
    );
  }
  const ids = new Set<string>();
  for (const form of forms) {
    if (!FORM_ID.test(form.id) || ids.has(form.id)) {
      throw new RecordSchemaRolloutEvidenceError(
        'record-schema-rollout.invalid-form-set',
        'Rollout evidence form identifiers must be unique and stable.',
        form.id
      );
    }
    ids.add(form.id);
  }
}

function compareKinds(left: RecordContractSchemaKind, right: RecordContractSchemaKind): number {
  return left.localeCompare(right);
}

function findingKey(finding: Omit<MutableFinding, 'kinds'>): string {
  return [finding.form, finding.code, finding.pointer ?? '', finding.componentType ?? ''].join('\u0000');
}

function addDiagnosticFinding(
  findings: Map<string, MutableFinding>,
  form: string,
  kind: RecordContractSchemaKind,
  diagnostic: RecordContractDiagnostic
): void {
  const finding = {
    form,
    code: diagnostic.code,
    ...(diagnostic.pointer ? { pointer: diagnostic.pointer } : {}),
    ...(diagnostic.componentType ? { componentType: diagnostic.componentType } : {}),
  };
  const key = findingKey(finding);
  const existing = findings.get(key);
  if (existing) {
    existing.kinds.add(kind);
  } else {
    findings.set(key, { ...finding, kinds: new Set([kind]) });
  }
}

function legacyFindingKey(finding: Omit<MutableLegacyFinding, 'kinds'>): string {
  return [finding.form, finding.pointer, finding.componentType].join('\u0000');
}

function trackedRegistrations(
  registrations: readonly RecordContractContributorRegistration[],
  form: string,
  kind: RecordContractSchemaKind,
  legacyFindings: Map<string, MutableLegacyFinding>,
  schemaLegacyFindings: Set<string>
): readonly RecordContractContributorRegistration[] {
  return registrations.map(registration => {
    const contributor = registration.contributor;
    if (contributor.kind !== 'component' || contributor.nullability !== 'legacy-permissive') {
      return registration;
    }
    const tracked: RecordContractComponentContributor = {
      ...contributor,
      compile: context => {
        const finding = {
          form,
          pointer: context.pointer,
          componentType: contributor.componentType,
        };
        const key = legacyFindingKey(finding);
        const existing = legacyFindings.get(key);
        if (existing) {
          existing.kinds.add(kind);
        } else {
          legacyFindings.set(key, { ...finding, kinds: new Set([kind]) });
        }
        schemaLegacyFindings.add(key);
        return contributor.compile(context);
      },
    };
    return { ...registration, contributor: tracked };
  });
}

function nodeMetrics(node: ContractNode, depth = 0): NodeMetrics {
  switch (node.kind) {
    case 'scalar':
    case 'any':
      return { depth, properties: 0 };
    case 'array': {
      const child = nodeMetrics(node.items, depth + 1);
      return { depth: Math.max(depth, child.depth), properties: child.properties };
    }
    case 'object': {
      let deepest = depth;
      let properties = Object.keys(node.properties).length;
      for (const childNode of Object.values(node.properties)) {
        const child = nodeMetrics(childNode, depth + 1);
        deepest = Math.max(deepest, child.depth);
        properties += child.properties;
      }
      return { depth: deepest, properties };
    }
    case 'conditional': {
      const thenMetrics = nodeMetrics(node.thenNode, depth + 1);
      const elseMetrics = node.elseNode ? nodeMetrics(node.elseNode, depth + 1) : { depth, properties: 0 };
      return {
        depth: Math.max(depth, thenMetrics.depth, elseMetrics.depth),
        properties: thenMetrics.properties + elseMetrics.properties,
      };
    }
    default: {
      const exhaustive: never = node;
      throw new Error(`Unsupported record-contract node ${String(exhaustive)}.`);
    }
  }
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function immutableFindings(
  findings: ReadonlyMap<string, MutableFinding>
): readonly RecordSchemaRolloutEvidenceFinding[] {
  return [...findings.values()]
    .map(finding => ({
      form: finding.form,
      code: finding.code,
      kinds: [...finding.kinds].sort(compareKinds),
      ...(finding.pointer ? { pointer: finding.pointer } : {}),
      ...(finding.componentType ? { componentType: finding.componentType } : {}),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function immutableLegacyFindings(
  findings: ReadonlyMap<string, MutableLegacyFinding>
): readonly RecordSchemaRolloutLegacyNullabilityFinding[] {
  return [...findings.values()]
    .map(finding => ({
      form: finding.form,
      kinds: [...finding.kinds].sort(compareKinds),
      pointer: finding.pointer,
      componentType: finding.componentType,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function headroom(limit: number, observedMaximum: number): LimitHeadroom {
  return { limit, observedMaximum, remaining: limit - observedMaximum };
}

function reportText(report: RecordSchemaRolloutEvidenceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function readApprovedReport(reportPath: string): Promise<RecordSchemaRolloutEvidenceReport> {
  const metadata = await fs.stat(reportPath);
  if (metadata.size > MAX_REPORT_BYTES) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.report-too-large',
      'The approved rollout evidence report exceeds its byte bound.',
      path.basename(reportPath)
    );
  }
  const content = await fs.readFile(reportPath, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > MAX_REPORT_BYTES) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.report-too-large',
      'The approved rollout evidence report exceeds its byte bound.',
      path.basename(reportPath)
    );
  }
  return JSON.parse(content) as RecordSchemaRolloutEvidenceReport;
}

export async function generateRecordSchemaRolloutEvidence(
  options: Omit<RecordSchemaRolloutEvidenceOptions, 'approvedReport' | 'approvedReportPath'> = {}
): Promise<RecordSchemaRolloutEvidenceReport> {
  assertSafeDefaults();
  const forms = options.forms ?? DEFAULT_FORMS;
  const registrations = options.registrations ?? defaultRegistrations();
  const limits = options.limits ?? recordSchema.limits;
  assertForms(forms);

  const diagnostics = new Map<string, MutableFinding>();
  const legacyFindings = new Map<string, MutableLegacyFinding>();
  const schemas: RecordSchemaRolloutEvidenceEntry[] = [];

  for (const evidenceForm of [...forms].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const kind of ['create', 'update'] as const) {
      const schemaLegacyFindings = new Set<string>();
      const registry = new RecordContractContributorRegistry(
        trackedRegistrations(registrations, evidenceForm.id, kind, legacyFindings, schemaLegacyFindings)
      );
      const result = await new RecordContractCompiler(registry, limits).compile({
        form: evidenceForm.form,
        context: {
          brand: 'dev',
          portal: 'record-schema-rollout',
          kind,
          recordType: evidenceForm.form.type || evidenceForm.form.name,
          workflowStep: 'draft',
          form: evidenceForm.form.name,
          operation: 'strict-all',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        ...(evidenceForm.reusableFormDefinitions
          ? { reusableFormDefinitions: evidenceForm.reusableFormDefinitions }
          : {}),
      });
      if (result.kind !== 'compiled') {
        throw new RecordSchemaRolloutEvidenceError(
          'record-schema-rollout.compile-failed',
          `Representative dev-hook form compilation failed with ${result.code}.`,
          `${evidenceForm.id}:${kind}`
        );
      }

      for (const diagnostic of result.contract.diagnostics) {
        addDiagnosticFinding(diagnostics, evidenceForm.id, kind, diagnostic);
      }
      const artifact = compileRecordJsonSchemaArtifact(renderRecordJsonSchema(result.contract), {
        maxDocumentBytes: limits.maxDocumentBytes,
        maxValidationErrors: limits.maxDiagnostics,
      });
      const unknownProbe = artifact.validator.validate({ [UNKNOWN_PROPERTY_PROBE]: true });
      if (!unknownProbe.valid) {
        throw new RecordSchemaRolloutEvidenceError(
          'record-schema-rollout.unknown-property-rejected',
          'The compatibility-mode schema rejected an undeclared root property.',
          `${evidenceForm.id}:${kind}`
        );
      }
      const warningProbe = artifact.validator.validate([]);
      if (warningProbe.valid) {
        throw new RecordSchemaRolloutEvidenceError(
          'record-schema-rollout.shadow-warning-missing',
          'The representative schema did not produce the expected bounded structural warning probe.',
          `${evidenceForm.id}:${kind}`
        );
      }
      const metrics = nodeMetrics(result.contract.root);
      schemas.push({
        form: evidenceForm.id,
        kind,
        digest: artifact.digest,
        completeness: result.contract.completeness,
        byteLength: artifact.byteLength,
        observedNodeDepth: metrics.depth,
        observedProperties: Math.max(metrics.properties, Object.keys(result.contract.fieldOwners).length),
        diagnosticCount: result.contract.diagnostics.length,
        diagnosticCodes: uniqueSorted(result.contract.diagnostics.map(diagnostic => diagnostic.code)),
        legacyNullabilityCount: schemaLegacyFindings.size,
        unknownPropertyProbe: 'accepted',
        shadowWarningCodes: uniqueSorted(warningProbe.issues.map(issue => issue.code)),
      });
    }
  }

  const schemaDiagnostics = immutableFindings(diagnostics);
  const legacyNullability = immutableLegacyFindings(legacyFindings);
  const unsupportedComponents = schemaDiagnostics.filter(finding => finding.code === 'x-redbox-unsupported-component');
  if (schemaDiagnostics.length + legacyNullability.length > MAX_FINDINGS) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.too-many-findings',
      'The rollout evidence finding count exceeds its report bound.'
    );
  }

  const completeSchemas = schemas.filter(schema => schema.completeness === 'complete').length;
  const report: RecordSchemaRolloutEvidenceReport = {
    version: 1,
    defaults: {
      recordSchemaEnabled: false,
      recordValidationMode: 'shadow',
      unknownProperties: 'allow',
    },
    shadowRun: {
      recordSchemaEnabled: true,
      recordValidationMode: 'shadow',
      unknownProperties: 'allow',
    },
    bounds: {
      maxForms: MAX_FORMS,
      maxSchemas: MAX_FORMS * 2,
      maxFindings: MAX_FINDINGS,
      maxReportBytes: MAX_REPORT_BYTES,
    },
    summary: {
      formsChecked: forms.length,
      schemasChecked: schemas.length,
      completeSchemas,
      partialSchemas: schemas.length - completeSchemas,
      unsupportedComponents: unsupportedComponents.length,
      legacyNullability: legacyNullability.length,
      schemaWarnings: schemas.reduce((count, schema) => count + schema.shadowWarningCodes.length, 0),
      unknownPropertyProbesAccepted: schemas.filter(schema => schema.unknownPropertyProbe === 'accepted').length,
    },
    limitHeadroom: {
      cacheEntries: headroom(recordSchema.cacheMaxEntries, schemas.length),
      maxDepth: headroom(limits.maxDepth, Math.max(...schemas.map(schema => schema.observedNodeDepth))),
      maxProperties: headroom(limits.maxProperties, Math.max(...schemas.map(schema => schema.observedProperties))),
      maxDocumentBytes: headroom(limits.maxDocumentBytes, Math.max(...schemas.map(schema => schema.byteLength))),
      maxDiagnostics: headroom(limits.maxDiagnostics, Math.max(...schemas.map(schema => schema.diagnosticCount))),
      contributorTimeoutMs: { limit: limits.contributorTimeoutMs, breaches: 0 },
    },
    unsupportedComponents,
    legacyNullability,
    schemaDiagnostics,
    schemas,
  };
  const bytes = Buffer.byteLength(reportText(report), 'utf8');
  if (bytes > MAX_REPORT_BYTES) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.report-too-large',
      'The generated rollout evidence report exceeds its byte bound.'
    );
  }
  return report;
}

export async function runRecordSchemaRolloutEvidence(
  options: RecordSchemaRolloutEvidenceOptions = {}
): Promise<RecordSchemaRolloutEvidenceReport> {
  const generated = await generateRecordSchemaRolloutEvidence({
    ...(options.forms ? { forms: options.forms } : {}),
    ...(options.registrations ? { registrations: options.registrations } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
  });
  const approved =
    options.approvedReport ?? (await readApprovedReport(options.approvedReportPath ?? APPROVED_REPORT_PATH));
  if (reportText(generated) !== reportText(approved)) {
    throw new RecordSchemaRolloutEvidenceError(
      'record-schema-rollout.stale-report',
      'Generated shadow-rollout evidence does not match the approved bounded report.',
      path.basename(options.approvedReportPath ?? APPROVED_REPORT_PATH)
    );
  }
  return generated;
}

async function main(): Promise<void> {
  try {
    const report = await runRecordSchemaRolloutEvidence();
    process.stdout.write(
      `Record-schema shadow rollout passed: ${report.summary.formsChecked} forms, ${report.summary.schemasChecked} schemas, ${report.summary.completeSchemas} complete, ${report.summary.partialSchemas} partial, ${report.summary.unsupportedComponents} unsupported components, ${report.summary.legacyNullability} legacy-nullability findings.\n`
    );
    process.stdout.write(`Evidence: ${path.relative(process.cwd(), APPROVED_REPORT_PATH)}\n`);
  } catch (error) {
    const failure =
      error instanceof RecordSchemaRolloutEvidenceError
        ? `${error.code}${error.target ? ` [${error.target}]` : ''}: ${error.message}`
        : 'record-schema-rollout.unexpected: Record-schema rollout evidence failed.';
    process.stderr.write(`${failure.slice(0, 512)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
