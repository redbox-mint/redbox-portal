import {
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
  type RecordDefinitionRevisionDto,
  type RecordDefinitionDashboardDto,
  type RecordDefinitionValidationOperationDto,
} from '@researchdatabox/sails-ng-common';
import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { parseActionBinding, type RedboxActionRegistry } from '../action-registry';
import {
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  hashRecordDefinition,
  recordDefinitionRevisionSchema,
} from '../record-workflow-administration';
import type { RecordTypeAttributes } from '../waterline-models/RecordType';
import type { RecordDefinitionRevisionAttributes } from '../waterline-models/RecordDefinitionRevision';
import type { RecordTypeModel } from '../model/storage/RecordTypeModel';
import type { WorkflowStepModel } from '../model/storage/WorkflowStepModel';
import { coreRecordActionRegistry } from './record-actions/coordinator';

function validationOperations(operations: readonly RecordDefinitionValidationOperationDto[]) {
  return Object.fromEntries(
    operations.map(
      ({ name, allowedTargetStages, ...operation }) =>
        [
          name,
          {
            ...operation,
            ...(allowedTargetStages === undefined ? {} : { allowedTargetSteps: [...allowedTargetStages] }),
          },
        ] as const
    )
  );
}

function dashboardConfig(dashboard: RecordDefinitionDashboardDto | undefined) {
  if (!dashboard) return undefined;
  return {
    showAdminSideBar: dashboard.showAdminSidebar,
    table: {
      rowConfig: [...dashboard.columns]
        .sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(column => {
          // The existing dashboard renders Handlebars, and has no JSONata value evaluator.
          if (column.value.kind !== 'path')
            throw new Error('Dashboard JSONata values are not supported by the runtime consumer.');
          return {
            title: column.title,
            variable: column.value.path,
            // Literal segments preserve numeric/object keys and cannot invoke helpers.
            // The revision schema excludes empty and prototype-access segments.
            template:
              column.render?.template ??
              `{{this.${column.value.path
                .split('.')
                .map(segment => `[${segment}]`)
                .join('.')}}}`,
          };
        }),
    },
  };
}

/** Each schema-bounded immutable revision occupies at most one of these slots. */
export const RECORD_DEFINITION_RUNTIME_CACHE_MAX = 64;

export interface RecordDefinitionRuntimeServiceExports {
  resolve(brandId: string, key: string): Promise<ActiveRecordDefinition | null>;
  assertReady(): Promise<void>;
  invalidate(brandId: string, key: string): void;
}

export interface ActiveRecordDefinitionIdentity {
  readonly id: string;
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly packageType: string;
  readonly searchCore: string;
  readonly version: number;
  readonly retiredAt: string | null;
}

export interface ActiveRecordDefinition {
  readonly identity: ActiveRecordDefinitionIdentity;
  readonly revision: RecordDefinitionRevisionDto;
}

function freezeTree(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freezeTree(child);
  }
  Object.freeze(value);
}

function unavailable(): never {
  throw new Error('Active record definition is unavailable or invalid.');
}

export namespace Services {
  export class RecordDefinitionRuntime extends services.Core.Service {
    protected override _exportedMethods = ['resolve', 'assertReady', 'invalidate'];
    private readonly revisions = new Map<string, RecordDefinitionRevisionDto>();
    private readonly snapshots = new WeakMap<object, ActiveRecordDefinition>();
    private invalidationVersion = 0;

    public get cacheGeneration(): number {
      return this.invalidationVersion;
    }

    constructor(private readonly registry?: RedboxActionRegistry) {
      super();
    }

    /** No mutable pointer/negative cache: every call observes the shared datastore. */
    public async resolve(brandIdValue: string, keyValue: string): Promise<ActiveRecordDefinition | null> {
      const brandId = parseRecordDefinitionBrandId(brandIdValue);
      const key = parseRecordDefinitionKey(keyValue);
      const identity = await firstValueFrom(
        this.getObservable<RecordTypeAttributes | undefined>(
          RecordType.findOne({ where: { branding: brandId, name: key } })
        )
      );
      if (!identity) return null;
      if (String(identity.branding) !== brandId || identity.name !== key) return unavailable();
      return this.resolveIdentity(identity);
    }

    /** Internal adapter for an identity just read from storage, never a request payload. */
    public async resolveIdentity(identity: RecordTypeAttributes): Promise<ActiveRecordDefinition | null> {
      const brandId = parseRecordDefinitionBrandId(String(identity.branding));
      const key = parseRecordDefinitionKey(identity.name);
      if (identity.activeRevisionId == null && identity.activeRevisionNumber == null) {
        // Legacy rows remain usable until the separately scoped migration. Managed drafts do not.
        return null;
      }
      const number = identity.activeRevisionNumber;
      if (!Number.isSafeInteger(number) || number == null || number < 1) return unavailable();
      const id = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey: key }, number);
      if (
        identity.definitionId !== deriveRecordDefinitionId({ brandId, recordTypeKey: key }) ||
        identity.activeRevisionId !== id
      )
        return unavailable();
      const cacheKey = JSON.stringify([brandId, key, String(identity.id), id]);
      let revision = this.revisions.get(cacheKey);
      if (!revision) {
        const row = await firstValueFrom(
          this.getObservable<RecordDefinitionRevisionAttributes | undefined>(
            RecordDefinitionRevision.findOne({
              id,
              branding: brandId,
              recordType: identity.id,
              recordTypeId: identity.definitionId,
              recordTypeKey: key,
              revisionNumber: number,
            })
          )
        );
        if (
          !row ||
          row.id !== id ||
          String(row.branding) !== brandId ||
          String(row.recordType) !== String(identity.id) ||
          row.recordTypeId !== identity.definitionId ||
          row.recordTypeKey !== key ||
          row.revisionNumber !== number
        )
          return unavailable();
        const inspected = recordDefinitionRevisionSchema.safeParse({
          schemaVersion: row.schemaVersion,
          id: row.id,
          brandId,
          recordTypeKey: key,
          revisionNumber: row.revisionNumber,
          canonicalHash: row.canonicalHash,
          definition: row.definition,
          actionContracts: row.actionContracts,
          source: row.source,
          publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt,
          publishedBy: row.publishedBy,
          ...(row.publicationNote ? { publicationNote: row.publicationNote } : {}),
        });
        if (!inspected.success || hashRecordDefinition(inspected.data.definition) !== inspected.data.canonicalHash)
          return unavailable();
        revision = inspected.data;
        freezeTree(revision);
        if (this.revisions.size >= RECORD_DEFINITION_RUNTIME_CACHE_MAX) {
          const oldest = this.revisions.keys().next().value;
          if (oldest !== undefined) this.revisions.delete(oldest);
        }
        this.revisions.set(cacheKey, revision);
      }
      // Match publication/execution: hooks contribute through the loader-owned registry.
      const registry = this.registry ?? sails.config.actionRegistry ?? coreRecordActionRegistry();
      // Check actual bindings as well as the persisted manifest, including on cache hits.
      for (const reference of [...revision.actionContracts, ...revision.definition.actionBindings]) {
        if (registry.lookup(reference.actionId, reference.contractVersion).status !== 'available') {
          throw new Error('Active record definition references an unavailable action contract.');
        }
      }
      // Readiness must reject published dashboard values this node cannot render, too.
      dashboardConfig(revision.definition.recordType.dashboard);
      for (const stage of revision.definition.stages) dashboardConfig(stage.dashboard);
      const retiredAt = identity.retiredAt == null ? null : new Date(identity.retiredAt).toISOString();
      return Object.freeze({
        identity: Object.freeze({
          id: String(identity.id),
          brandId,
          recordTypeKey: key,
          packageType: identity.packageType ?? '',
          searchCore: identity.searchCore ?? '',
          version: identity.version ?? 0,
          retiredAt,
        }),
        revision,
      });
    }

    public invalidate(brandId: string, key: string): void {
      this.invalidationVersion++;
      for (const [cacheKey, revision] of this.revisions) {
        if (revision.brandId === brandId && revision.recordTypeKey === key) this.revisions.delete(cacheKey);
      }
    }

    /** Probe freshly reads all identities, including retired types used by existing records. */
    public async assertReady(): Promise<void> {
      const identities = await firstValueFrom(this.getObservable<RecordTypeAttributes[]>(RecordType.find({})));
      for (const identity of identities) {
        if (identity.activeRevisionId != null || identity.activeRevisionNumber != null)
          await this.resolveIdentity(identity);
      }
    }

    public async project(identity: RecordTypeAttributes, fields: string[] | null = null): Promise<RecordTypeModel> {
      if (identity.activeRevisionId == null && identity.activeRevisionNumber == null) {
        if (identity.draftId != null || (identity.version ?? 0) > 0) return unavailable();
        return (fields ? _.pick(identity, ['id', ...fields]) : identity) as object as RecordTypeModel;
      }
      const active = await this.resolveIdentity(identity);
      if (!active) return unavailable();
      const { recordType, actionBindings, transitions } = structuredClone(active.revision.definition);
      const projected = {
        id: active.identity.id,
        branding: active.identity.brandId,
        name: active.identity.recordTypeKey,
        packageType: active.identity.packageType,
        searchCore: active.identity.searchCore,
        retiredAt: active.identity.retiredAt,
        activeRevisionId: active.revision.id,
        activeRevisionNumber: active.revision.revisionNumber,
        version: active.identity.version,
        labels: recordType.labels,
        searchable: recordType.searchable,
        hooks: undefined,
        concurrentModification: recordType.concurrency,
        recordValidation: {
          mode: recordType.validation.mode,
          operations: validationOperations(recordType.validation.operations),
        },
        searchFilters: recordType.searchFilters.map(filter => ({
          name: filter.field,
          title: filter.title,
          type: filter.kind,
          typeLabel: filter.typeLabel,
          alwaysActive: filter.alwaysActive,
        })),
        relatedTo: recordType.relationships.map(({ targetRecordTypeKey, ...relationship }) => ({
          ...relationship,
          recordType: targetRecordTypeKey,
        })),
        transferResponsibility: {
          fields: Object.fromEntries(
            recordType.transferResponsibility.fields.map(({ field, fieldNames, ...settings }) => [
              field,
              { ...settings, fieldNames: Object.fromEntries(fieldNames.map(item => [item.name, item.field])) },
            ])
          ),
          canEdit: Object.fromEntries(
            recordType.transferResponsibility.roleRules.map(rule => [rule.role, rule.editableFields])
          ),
        },
        dashboard: dashboardConfig(recordType.dashboard),
        actionPlan: {
          schemaVersion: 1 as const,
          recordTypeKey: active.revision.recordTypeKey,
          bindings: actionBindings.map(binding => parseActionBinding(binding)),
        },
        automaticTransitions: transitions
          .filter(transition => transition.mode === 'automatic')
          .map(transition => ({
            schemaVersion: 1 as const,
            id: transition.id,
            mode: 'automatic' as const,
            event: transition.event,
            priority: transition.priority,
            condition: transition.condition,
            ...(transition.validationOperation ? { validationOperation: transition.validationOperation } : {}),
            sourceStage: transition.sourceStageKey,
            targetStage: transition.targetStageKey,
          })),
      } as object as RecordTypeModel;
      const result = fields ? (_.pick(projected, ['id', ...fields]) as RecordTypeModel) : projected;
      this.snapshots.set(result, active);
      return result;
    }

    public snapshot(recordType: object): ActiveRecordDefinition | undefined {
      return this.snapshots.get(recordType);
    }

    /** Keep stages paired with the record settings snapshot selected for this operation. */
    public async stages(recordType: Partial<RecordTypeModel> & { id?: string }): Promise<WorkflowStepModel[] | null> {
      let active = this.snapshots.get(recordType);
      if (!active && recordType.id) {
        const identity = await firstValueFrom(
          this.getObservable<RecordTypeAttributes | undefined>(RecordType.findOne({ id: recordType.id }))
        );
        if (!identity) return unavailable();
        if (identity.activeRevisionId == null && (identity.draftId != null || (identity.version ?? 0) > 0))
          return unavailable();
        active = (await this.resolveIdentity(identity)) ?? undefined;
      }
      if (!active) return null;
      return active.revision.definition.stages.map(
        stage =>
          ({
            name: stage.key,
            starting: stage.starting,
            hidden: false,
            recordType: recordType as RecordTypeModel,
            config: {
              workflow: { stage: stage.key, stageLabel: stage.label },
              form: stage.formReference,
              authorization: { viewRoles: [...stage.viewRoles], editRoles: [...stage.editRoles] },
              displayIndex: stage.displayOrder,
              baseRecordType: stage.baseRecordTypeKey,
              recordValidation: {
                operations: validationOperations(stage.validationOverrides),
              },
              dashboard: dashboardConfig(stage.dashboard ?? active.revision.definition.recordType.dashboard),
            },
          }) as object as WorkflowStepModel
      );
    }
  }
}

let runtime: Services.RecordDefinitionRuntime | undefined;
export function activeRecordDefinitions(): Services.RecordDefinitionRuntime {
  return (runtime ??= new Services.RecordDefinitionRuntime());
}
