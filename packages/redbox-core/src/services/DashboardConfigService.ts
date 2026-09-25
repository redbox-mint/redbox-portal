import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import type { DashboardViewDefinition } from '../config/dashboardview.config';
import type { DashboardConfigurationAttributes } from '../waterline-models/DashboardConfiguration';
import {
  DASHBOARD_CONFIGURATION_SCHEMA_VERSION,
  DashboardConfigurationData,
  DashboardCopyGroup,
  DashboardFinding,
  DashboardGroupChange,
  DashboardModeContext,
  DashboardSettings,
  DashboardTarget,
  applyCopyGroups,
  builtInDashboardSettings,
  describeGroupChanges,
  emptyDashboardConfigurationData,
  findSourceSpecificReferences,
  findUnclassifiedFields,
  fingerprint,
  getTargetSettings,
  isAllSelection,
  normaliseCopySelection,
  normaliseDashboardSettings,
  parseDashboardTarget,
  sameTarget,
  setTargetSettings,
  targetKey,
  targetLabel,
  validateDashboardSettings
} from '../configmodels/DashboardSettings';
import {
  DASHBOARD_SYSTEM_FIELDS,
  DashboardFieldCatalogue,
  collectSettingsFieldPaths,
  flattenRecordJsonSchema,
  isKnownFieldPath,
  labelForFieldPath
} from '../configmodels/DashboardFieldCatalogue';
import type { FormRecordAccessContext } from './FormsService';
import type { DescribeRecordStageSchemaRequest, DescribeRecordStageSchemaResult } from './RecordSchemaService';
import {
  LegacyCaptureInput,
  LegacyConversionResult,
  LegacyDashboardTypeInput,
  LegacyMigrationFinding,
  LegacyOverrideInput,
  LegacyRecordTypeInput,
  convertLegacyDashboardConfiguration,
  summariseLegacyConversion
} from './DashboardLegacyConversion';

type AnyRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is AnyRecord {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface DashboardMigrationReplacement {
  brand: string;
  target: unknown;
  settings: unknown;
}

interface DashboardMigrationResolutions {
  captureFingerprints: Record<string, string>;
  acceptedFindingIdsByBrand: Record<string, string[]>;
  replacements: DashboardMigrationReplacement[];
}

/** Name of the app-local migration wrapper that runs the legacy conversion. */
export const DASHBOARD_CONFIGURATION_MIGRATION_NAME = '20260925T000000-dashboard-stage-configuration';
/** AppConfig key holding the immutable pre-migration recovery snapshot. */
export const DASHBOARD_LEGACY_SNAPSHOT_KEY = 'dashboardConfigLegacySnapshot';
/** Retired AppConfig key; readable by the migration only. */
export const DASHBOARD_LEGACY_OVERRIDE_KEY = 'dashboardTableConfig';
/** AppConfig keys that generic configuration writes must not touch. */
export const RESERVED_DASHBOARD_APP_CONFIG_KEYS = [DASHBOARD_LEGACY_OVERRIDE_KEY, DASHBOARD_LEGACY_SNAPSHOT_KEY];
const COLLECTION_NAME = 'dashboardconfiguration';
/** Headroom below MongoDB's 16MB document limit. */
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
/** Field catalogues are an authoring aid; a short cache avoids recompiling schemas for every validation. */
const FIELD_CATALOGUE_TTL_MS = 60 * 1000;

export namespace Services {
  export type DashboardConfigErrorCode =
    | 'invalid-request'
    | 'invalid-settings'
    | 'target-not-found'
    | 'stale-revision'
    | 'stale-preview'
    | 'warnings-require-review'
    | 'unsaved-source'
    | 'configuration-too-large'
    | 'configuration-unavailable'
    | 'settings-changed'
    | 'legacy-operation-retired';

  const STATUS_BY_CODE: Record<DashboardConfigErrorCode, number> = {
    'invalid-request': 400,
    'invalid-settings': 400,
    'configuration-too-large': 400,
    'target-not-found': 404,
    'stale-revision': 409,
    'stale-preview': 409,
    'warnings-require-review': 409,
    'unsaved-source': 409,
    'settings-changed': 409,
    'legacy-operation-retired': 410,
    'configuration-unavailable': 503
  };

  /** Typed domain error. Controllers translate `code` to a response status. */
  export class DashboardConfigError extends Error {
    public readonly status: number;
    constructor(
      public readonly code: DashboardConfigErrorCode,
      message: string,
      public readonly details: AnyRecord = {}
    ) {
      super(message);
      this.name = 'DashboardConfigError';
      this.status = STATUS_BY_CODE[code];
    }
  }

  export interface DashboardTargetInfo {
    target: DashboardTarget;
    key: string;
    ownerLabel: string;
    stepLabel: string;
    hidden: boolean;
    /** Record type whose records this target lists (views: the source record type). */
    recordType: string;
    /** Record-type keys the page uses to look up search filters for this target. */
    queryFilterKeys: string[];
    displayIndex?: number;
  }

  export interface DashboardTargetCatalogue {
    targets: DashboardTargetInfo[];
    /** Saved targets whose workflow stage or view step no longer exists. Retained for recovery. */
    removed: Array<{ target: DashboardTarget; key: string }>;
    fingerprint: string;
  }

  export interface DashboardTargetSettingsResult {
    target: DashboardTarget;
    settings: DashboardSettings;
    revision: number;
    schemaVersion: number;
    hidden: boolean;
  }

  export interface DashboardValidationResult {
    target: DashboardTarget;
    expectedRevision: number;
    errors: DashboardFinding[];
    warnings: DashboardFinding[];
    validationFingerprint: string;
  }

  export interface DashboardSaveRequest {
    expectedRevision: number;
    settings: unknown;
    validationFingerprint?: string;
    acknowledgedWarningIds?: string[];
  }

  export interface DashboardCopyRequest {
    source: unknown;
    destinations: unknown;
    groups: unknown;
  }

  export interface DashboardCopyApplyRequest extends DashboardCopyRequest {
    expectedRevision: number;
    previewFingerprint: string;
    acknowledgedWarningIds?: string[];
  }

  export interface DashboardCopyPreview {
    expectedRevision: number;
    previewFingerprint: string;
    source: DashboardTarget;
    destinations: DashboardTarget[];
    groups: Array<DashboardCopyGroup | 'all'>;
    changes: Array<{ target: DashboardTarget; label: string; hidden: boolean; groups: DashboardGroupChange[] }>;
    errors: DashboardFinding[];
    warnings: DashboardFinding[];
  }

  export interface DashboardRuntimeSettings {
    revision: number;
    targets: Record<string, { settings: DashboardSettings; fingerprint: string }>;
  }

  export interface LegacyPreflightReport {
    brand: { id: string; name: string };
    alreadyMigrated: boolean;
    conversion: LegacyConversionResult;
    summary: string;
  }

  /** The administrator on whose behalf field catalogues are resolved. */
  export interface DashboardCallerOptions {
    caller?: FormRecordAccessContext;
    portal?: string;
  }

  interface LoadedDocument {
    id: string;
    branding: string;
    revision: number;
    configData: DashboardConfigurationData;
    provenance: AnyRecord;
  }

  /**
   * Independent dashboard configuration for workflow stages and custom-view
   * steps. Administrative reads/writes and the dashboard runtime (including
   * template compilation) use this service as their single source.
   */
  export class DashboardConfig extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'isReady',
      'initialiseAfterBootstrap',
      'initialiseMissingTargets',
      'getTargetCatalogue',
      'getTargetSettings',
      'validateTargetSettings',
      'saveTargetSettings',
      'previewCopy',
      'applyCopy',
      'getRuntimeSettings',
      'getRuntimeTargetSettings',
      'getDashboardContext',
      'captureLegacyInput',
      'preflightLegacyMigration',
      'migrateLegacyConfiguration',
      'isReservedAppConfigKey',
      'getFieldCatalogue'
    ];

    private ready = false;
    private fieldCatalogueCache = new Map<string, { expires: number; value: Promise<DashboardFieldCatalogue> }>();
    private notReadyReason = 'Dashboard configuration has not been initialised yet.';

    public async bootstrap(): Promise<void> {
      sails.log.verbose('DashboardConfigService bootstrapped');
    }

    public isReady(): boolean {
      return this.ready;
    }

    public isReservedAppConfigKey(configKey: string): boolean {
      return RESERVED_DASHBOARD_APP_CONFIG_KEYS.includes(configKey);
    }

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    private getCollection(): { createIndex: (spec: object, options?: object) => Promise<unknown>; updateOne: (filter: object, update: object) => Promise<{ matchedCount?: number; modifiedCount?: number }> } | null {
      const datastore = (DashboardConfiguration as unknown as { getDatastore?: () => { manager?: { collection?: (name: string) => unknown } } }).getDatastore?.();
      const collection = datastore?.manager?.collection?.(COLLECTION_NAME);
      return (collection as ReturnType<DashboardConfig['getCollection']>) ?? null;
    }

    /** The Mongo adapter ignores Waterline index declarations under `migrate: 'safe'`. */
    private async ensureStorage(): Promise<void> {
      const collection = this.getCollection();
      if (collection?.createIndex) {
        // Use Mongo's default name (`branding_1`) so this is idempotent with
        // the identical index Waterline may already have created.
        await collection.createIndex({ branding: 1 }, { unique: true });
      } else {
        sails.log.warn('DashboardConfigService: datastore does not expose a native collection; unique brand index not verified.');
      }
    }

    private toDocument(record: DashboardConfigurationAttributes | null | undefined): LoadedDocument | null {
      if (!record) {
        return null;
      }
      const configData = (record.configData ?? emptyDashboardConfigurationData()) as DashboardConfigurationData;
      return {
        id: String(record.id),
        branding: String(record.branding),
        revision: Number(record.revision),
        configData: {
          schemaVersion: DASHBOARD_CONFIGURATION_SCHEMA_VERSION,
          workflows: configData.workflows ?? {},
          views: configData.views ?? {},
          contexts: configData.contexts ?? {}
        },
        provenance: (record.provenance ?? {}) as AnyRecord
      };
    }

    private async loadDocument(brandId: string): Promise<LoadedDocument | null> {
      const record = await DashboardConfiguration.findOne({ branding: brandId });
      return this.toDocument(record as DashboardConfigurationAttributes | undefined);
    }

    private async requireDocument(brand: BrandingModel): Promise<LoadedDocument> {
      const doc = await this.loadDocument(String(brand.id));
      if (!doc) {
        throw new DashboardConfigError('configuration-unavailable', this.ready ? `Dashboard configuration for brand "${brand.name}" is not available.` : this.notReadyReason);
      }
      return doc;
    }

    private checkSize(data: DashboardConfigurationData): void {
      const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (bytes > MAX_DOCUMENT_BYTES) {
        throw new DashboardConfigError('configuration-too-large', `The resulting dashboard configuration (${Math.round(bytes / 1024)} KB) exceeds the storage limit. Nothing was changed.`);
      }
    }

    /**
     * Atomically replace the brand document if it is still at `expectedRevision`.
     * Returns false when another writer got there first; nothing is changed.
     */
    private async conditionalUpdate(doc: LoadedDocument, nextData: DashboardConfigurationData, provenance?: AnyRecord): Promise<boolean> {
      this.checkSize(nextData);
      const set: AnyRecord = {
        configData: nextData,
        revision: doc.revision + 1,
        updatedAt: new Date().toISOString(),
        ...(provenance ? { provenance } : {})
      };
      const collection = this.getCollection();
      if (collection?.updateOne) {
        const result = await collection.updateOne({ branding: doc.branding, revision: doc.revision }, { $set: set });
        return (result?.matchedCount ?? 0) === 1;
      }
      // Non-Mongo adapters (unit tests): a criteria update including the revision.
      const updated = await DashboardConfiguration.update({ branding: doc.branding, revision: doc.revision }).set(set as Partial<DashboardConfigurationAttributes>).fetch();
      return Array.isArray(updated) && updated.length === 1;
    }

    private isDuplicateKeyError(error: unknown): boolean {
      const e = error as { code?: unknown; name?: string; message?: string; raw?: { code?: unknown } };
      return e?.code === 'E_UNIQUE' || e?.code === 11000 || e?.raw?.code === 11000 || /duplicate key/i.test(String(e?.message ?? ''));
    }

    /** Create the brand document, or return the one a concurrent creator made. */
    private async createDocument(brandId: string, data: DashboardConfigurationData, provenance: AnyRecord): Promise<LoadedDocument> {
      this.checkSize(data);
      try {
        await DashboardConfiguration.create({ branding: brandId, revision: 1, configData: data, provenance });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
      }
      const doc = await this.loadDocument(brandId);
      if (!doc) {
        throw new Error(`Dashboard configuration for brand ${brandId} could not be created`);
      }
      return doc;
    }

    // -----------------------------------------------------------------------
    // Target catalogue
    // -----------------------------------------------------------------------

    public async getTargetCatalogue(brand: BrandingModel, data?: DashboardConfigurationData): Promise<DashboardTargetCatalogue> {
      const configData = data ?? (await this.loadDocument(String(brand.id)))?.configData ?? emptyDashboardConfigurationData();
      const targets: DashboardTargetInfo[] = [];
      const workspaceRecordType = configData.contexts?.workspace?.recordTypeFilterBy;
      const recordTypes = await firstValueFrom(RecordTypesService.getAll(brand));
      for (const recordType of recordTypes) {
        const recordTypeName = String((recordType as unknown as { name?: string }).name ?? '');
        if (!recordTypeName) {
          continue;
        }
        const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordTypeIncludingHidden(recordType));
        const ordered = [...steps].sort((a, b) => (Number(_.get(a, 'config.displayIndex', Number.MAX_SAFE_INTEGER)) - Number(_.get(b, 'config.displayIndex', Number.MAX_SAFE_INTEGER))));
        for (const step of ordered) {
          const stage = String(step.name ?? '');
          if (!stage) {
            continue;
          }
          const target: DashboardTarget = { kind: 'workflow', recordType: recordTypeName, stage };
          targets.push({
            target,
            key: targetKey(target),
            ownerLabel: recordTypeName,
            stepLabel: String(_.get(step, 'config.workflow.stageLabel', stage)),
            hidden: (step as unknown as { hidden?: boolean }).hidden === true,
            recordType: recordTypeName,
            queryFilterKeys: workspaceRecordType === recordTypeName ? [recordTypeName, 'workspace'] : [recordTypeName],
            displayIndex: _.get(step, 'config.displayIndex') as number | undefined
          });
        }
      }
      for (const [viewName, viewDef] of Object.entries((sails.config.dashboardview ?? {}) as Record<string, DashboardViewDefinition>)) {
        for (const step of viewDef?.steps ?? []) {
          if (!step?.name) {
            continue;
          }
          const target: DashboardTarget = { kind: 'view', view: viewName, step: step.name };
          targets.push({
            target,
            key: targetKey(target),
            ownerLabel: viewDef.titleLabelKey || viewName,
            stepLabel: step.name,
            hidden: false,
            recordType: step.sourceRecordType || viewDef.sourceRecordType,
            queryFilterKeys: [viewDef.sourceRecordType]
          });
        }
      }
      const available = new Set(targets.map((t) => t.key));
      const removed: DashboardTargetCatalogue['removed'] = [];
      for (const [recordType, stages] of Object.entries(configData.workflows)) {
        for (const stage of Object.keys(stages)) {
          const target: DashboardTarget = { kind: 'workflow', recordType, stage };
          if (!available.has(targetKey(target))) {
            removed.push({ target, key: targetKey(target) });
          }
        }
      }
      for (const [view, steps] of Object.entries(configData.views)) {
        for (const step of Object.keys(steps)) {
          const target: DashboardTarget = { kind: 'view', view, step };
          if (!available.has(targetKey(target))) {
            removed.push({ target, key: targetKey(target) });
          }
        }
      }
      return {
        targets,
        removed,
        fingerprint: fingerprint(targets.map((t) => [t.key, t.hidden, t.recordType, t.queryFilterKeys]))
      };
    }

    private requireAvailableTarget(catalogue: DashboardTargetCatalogue, value: unknown, role = 'Target'): { target: DashboardTarget; info: DashboardTargetInfo } {
      const target = parseDashboardTarget(value);
      if (!target) {
        throw new DashboardConfigError('invalid-request', `${role} must be { kind: "workflow", recordType, stage } or { kind: "view", view, step }.`);
      }
      const info = catalogue.targets.find((t) => t.key === targetKey(target));
      if (!info) {
        throw new DashboardConfigError('target-not-found', `${role} ${targetLabel(target)} is not available in this brand.`, { target });
      }
      return { target, info };
    }

    // -----------------------------------------------------------------------
    // Read / validate / save
    // -----------------------------------------------------------------------

    public async getTargetSettings(brand: BrandingModel, targetInput: unknown): Promise<DashboardTargetSettingsResult> {
      const doc = await this.requireDocument(brand);
      const catalogue = await this.getTargetCatalogue(brand, doc.configData);
      const { target, info } = this.requireAvailableTarget(catalogue, targetInput);
      const settings = getTargetSettings(doc.configData, target);
      if (!settings) {
        throw new DashboardConfigError('configuration-unavailable', `${targetLabel(target)} has no saved dashboard settings yet. Restart initialisation or check the migration report.`);
      }
      return { target, settings: normaliseDashboardSettings(settings), revision: doc.revision, schemaVersion: DASHBOARD_CONFIGURATION_SCHEMA_VERSION, hidden: info.hidden };
    }

    /** Incoming settings must be a complete object; required flags are not defaulted. */
    private prepareIncomingSettings(target: DashboardTarget, value: unknown): { settings: DashboardSettings; shapeErrors: DashboardFinding[] } {
      const shapeErrors = validateDashboardSettings(value, { target, queryFilterKeys: [] }).filter((f) => f.severity === 'error' && f.code === 'invalid-shape' && (f.path === '' || f.path === 'searchable' || f.path === 'showStageTitle' || f.path === 'tableConfig'));
      return { settings: normaliseDashboardSettings(value), shapeErrors };
    }

    private validateCandidate(info: DashboardTargetInfo, settings: DashboardSettings, catalogue?: DashboardFieldCatalogue): DashboardFinding[] {
      const findings = validateDashboardSettings(settings, { target: info.target, queryFilterKeys: info.queryFilterKeys });
      const warn = (code: string, path: string, message: string) => {
        findings.push({ id: fingerprint([info.key, code, path]).slice(0, 16), severity: 'warning', code, target: info.target, path, message });
      };
      if (info.target.kind === 'workflow' && settings.tableConfig.formatRules.groupBy) {
        warn('grouping-not-supported', 'tableConfig.formatRules.groupBy', 'Grouping only applies to custom dashboard views; workflow stage dashboards ignore it.');
      }
      if (info.target.kind === 'view' && settings.searchable) {
        warn('search-not-supported', 'searchable', 'Custom dashboard views do not show a search box; this setting has no effect here.');
      }
      if (catalogue && catalogue.status !== 'unavailable') {
        for (const { settingsPath, fieldPath } of collectSettingsFieldPaths(settings)) {
          if (!isKnownFieldPath(catalogue, fieldPath)) {
            warn('unknown-field', settingsPath, `"${fieldPath}" is not a field of ${catalogue.recordType}${catalogue.workflowStage ? ` at stage ${catalogue.workflowStage}` : ''} according to its record schema. Records may still contain it, but check the spelling.`);
          }
        }
      }
      return findings;
    }

    private validationFingerprint(brand: BrandingModel, operation: string, target: DashboardTarget, expectedRevision: number, settings: DashboardSettings, catalogueFingerprint: string, findings: DashboardFinding[]): string {
      return fingerprint({ brand: String(brand.id), operation, target: targetKey(target), expectedRevision, settings, catalogueFingerprint, findings: findings.map((f) => f.id).sort() });
    }

    private requireRevision(value: unknown): number {
      const revision = Number(value);
      if (!Number.isInteger(revision) || revision < 1) {
        throw new DashboardConfigError('invalid-request', 'expectedRevision must be a positive integer.');
      }
      return revision;
    }

    public async validateTargetSettings(brand: BrandingModel, targetInput: unknown, expectedRevisionInput: unknown, settingsInput: unknown, options: DashboardCallerOptions = {}): Promise<DashboardValidationResult> {
      const expectedRevision = this.requireRevision(expectedRevisionInput);
      const doc = await this.requireDocument(brand);
      const catalogue = await this.getTargetCatalogue(brand, doc.configData);
      const { target, info } = this.requireAvailableTarget(catalogue, targetInput);
      if (doc.revision !== expectedRevision) {
        throw new DashboardConfigError('stale-revision', 'Dashboard settings were changed by someone else. Reload before continuing.', { currentRevision: doc.revision, expectedRevision });
      }
      const { settings, shapeErrors } = this.prepareIncomingSettings(target, settingsInput);
      const fieldCatalogue = shapeErrors.length ? undefined : await this.fieldCatalogueFor(brand, info, options);
      const findings = shapeErrors.length ? shapeErrors : this.validateCandidate(info, settings, fieldCatalogue);
      const errors = findings.filter((f) => f.severity === 'error');
      const warnings = findings.filter((f) => f.severity === 'warning');
      return { target, expectedRevision, errors, warnings, validationFingerprint: this.validationFingerprint(brand, 'save', target, expectedRevision, settings, catalogue.fingerprint, findings) };
    }

    public async saveTargetSettings(brand: BrandingModel, targetInput: unknown, request: DashboardSaveRequest, options: DashboardCallerOptions = {}): Promise<DashboardTargetSettingsResult> {
      const validation = await this.validateTargetSettings(brand, targetInput, request?.expectedRevision, request?.settings, options);
      if (validation.errors.length) {
        throw new DashboardConfigError('invalid-settings', 'The dashboard settings are not valid. Nothing was saved.', { errors: validation.errors, warnings: validation.warnings });
      }
      const acknowledged = new Set(Array.isArray(request.acknowledgedWarningIds) ? request.acknowledgedWarningIds.map(String) : []);
      if (validation.warnings.length && (request.validationFingerprint !== validation.validationFingerprint || !validation.warnings.every((w) => acknowledged.has(w.id)))) {
        throw new DashboardConfigError('warnings-require-review', 'Review the warnings for these settings before saving.', { warnings: validation.warnings, validationFingerprint: validation.validationFingerprint });
      }
      const { settings } = this.prepareIncomingSettings(validation.target, request.settings);
      const doc = await this.requireDocument(brand);
      if (doc.revision !== validation.expectedRevision) {
        throw new DashboardConfigError('stale-revision', 'Dashboard settings were changed by someone else. Reload before saving.', { currentRevision: doc.revision });
      }
      const next = _.cloneDeep(doc.configData) as DashboardConfigurationData;
      setTargetSettings(next, validation.target, settings);
      if (!(await this.conditionalUpdate(doc, next))) {
        throw new DashboardConfigError('stale-revision', 'Dashboard settings were changed by someone else while saving. Nothing was saved; reload and try again.');
      }
      const catalogue = await this.getTargetCatalogue(brand, next);
      return {
        target: validation.target,
        settings,
        revision: doc.revision + 1,
        schemaVersion: DASHBOARD_CONFIGURATION_SCHEMA_VERSION,
        hidden: catalogue.targets.find((t) => t.key === targetKey(validation.target))?.hidden === true
      };
    }

    // -----------------------------------------------------------------------
    // Bulk copy
    // -----------------------------------------------------------------------

    public async previewCopy(brand: BrandingModel, request: DashboardCopyRequest, options: DashboardCallerOptions = {}): Promise<DashboardCopyPreview> {
      const doc = await this.requireDocument(brand);
      return this.computeCopyPreview(brand, doc, request, options);
    }

    private async computeCopyPreview(brand: BrandingModel, doc: LoadedDocument, request: DashboardCopyRequest, options: DashboardCallerOptions = {}): Promise<DashboardCopyPreview> {
      const groups = normaliseCopySelection(request?.groups);
      if (!groups) {
        throw new DashboardConfigError('invalid-request', 'groups must list one or more of: columnsAndActions, filtersAndSearch, grouping, all.');
      }
      const catalogue = await this.getTargetCatalogue(brand, doc.configData);
      const source = this.requireAvailableTarget(catalogue, request.source, 'Source');
      if (!Array.isArray(request.destinations) || request.destinations.length === 0) {
        throw new DashboardConfigError('invalid-request', 'Select at least one destination.');
      }
      const destinations = request.destinations.map((d, i) => this.requireAvailableTarget(catalogue, d, `Destination ${i + 1}`));
      const keys = new Set<string>();
      for (const destination of destinations) {
        if (sameTarget(destination.target, source.target)) {
          throw new DashboardConfigError('invalid-request', 'The source cannot also be a destination.');
        }
        if (keys.has(destination.info.key)) {
          throw new DashboardConfigError('invalid-request', `${targetLabel(destination.target)} is listed more than once.`);
        }
        keys.add(destination.info.key);
      }
      const sourceSettings = getTargetSettings(doc.configData, source.target);
      if (!sourceSettings) {
        throw new DashboardConfigError('unsaved-source', `${targetLabel(source.target)} has no saved settings to copy.`);
      }

      const errors: DashboardFinding[] = [];
      const warnings: DashboardFinding[] = [];
      const selectionIsAll = isAllSelection(request.groups);
      if (selectionIsAll) {
        for (const field of findUnclassifiedFields(normaliseDashboardSettings(sourceSettings))) {
          errors.push({ id: fingerprint([source.info.key, 'unclassified-field', field]).slice(0, 16), severity: 'error', code: 'unclassified-field', target: source.target, path: field, message: `"${field}" is not a recognised dashboard setting, so "All settings" cannot decide whether to copy it. Copy individual groups instead or remove the field.` });
        }
      }
      const changes: DashboardCopyPreview['changes'] = [];
      const candidates: Record<string, DashboardSettings> = {};
      for (const destination of destinations) {
        const before = normaliseDashboardSettings(getTargetSettings(doc.configData, destination.target) ?? builtInDashboardSettings());
        const after = applyCopyGroups(sourceSettings, before, groups);
        candidates[destination.info.key] = after;
        const findings = [
          ...this.validateCandidate(destination.info, after, await this.fieldCatalogueFor(brand, destination.info, options)),
          ...findSourceSpecificReferences(source.target, destination.target, after, groups, source.info.recordType, destination.info.recordType)
        ];
        errors.push(...findings.filter((f) => f.severity === 'error'));
        warnings.push(...findings.filter((f) => f.severity === 'warning'));
        changes.push({ target: destination.target, label: targetLabel(destination.target), hidden: destination.info.hidden, groups: describeGroupChanges(before, after, groups) });
      }
      const selection: Array<DashboardCopyGroup | 'all'> = selectionIsAll ? ['all'] : groups;
      const previewFingerprint = fingerprint({
        brand: String(brand.id),
        operation: 'copy',
        source: source.info.key,
        destinations: destinations.map((d) => d.info.key),
        groups: selection,
        expectedRevision: doc.revision,
        candidates,
        catalogueFingerprint: catalogue.fingerprint,
        findings: [...errors, ...warnings].map((f) => f.id).sort()
      });
      return { expectedRevision: doc.revision, previewFingerprint, source: source.target, destinations: destinations.map((d) => d.target), groups: selection, changes, errors, warnings };
    }

    public async applyCopy(brand: BrandingModel, request: DashboardCopyApplyRequest, options: DashboardCallerOptions = {}): Promise<{ updated: number; revision: number; destinations: DashboardTarget[] }> {
      const expectedRevision = this.requireRevision(request?.expectedRevision);
      const doc = await this.requireDocument(brand);
      if (doc.revision !== expectedRevision) {
        throw new DashboardConfigError('stale-preview', 'Dashboard settings changed after the preview was made. Nothing was copied; create a new preview.', { currentRevision: doc.revision });
      }
      const preview = await this.computeCopyPreview(brand, doc, request, options);
      if (preview.previewFingerprint !== request.previewFingerprint) {
        throw new DashboardConfigError('stale-preview', 'The copy no longer matches the reviewed preview. Nothing was copied; create a new preview.');
      }
      if (preview.errors.length) {
        throw new DashboardConfigError('invalid-settings', 'The copy would produce invalid settings. Nothing was copied.', { errors: preview.errors, warnings: preview.warnings });
      }
      const acknowledged = new Set(Array.isArray(request.acknowledgedWarningIds) ? request.acknowledgedWarningIds.map(String) : []);
      const unacknowledged = preview.warnings.filter((w) => !acknowledged.has(w.id));
      if (unacknowledged.length) {
        throw new DashboardConfigError('warnings-require-review', 'Review every warning before applying the copy. Nothing was copied.', { warnings: unacknowledged });
      }
      const groups = normaliseCopySelection(request.groups) as DashboardCopyGroup[];
      const sourceSettings = getTargetSettings(doc.configData, preview.source) as DashboardSettings;
      const next = _.cloneDeep(doc.configData) as DashboardConfigurationData;
      for (const destination of preview.destinations) {
        const before = normaliseDashboardSettings(getTargetSettings(doc.configData, destination) ?? builtInDashboardSettings());
        setTargetSettings(next, destination, applyCopyGroups(sourceSettings, before, groups));
      }
      if (!(await this.conditionalUpdate(doc, next))) {
        throw new DashboardConfigError('stale-preview', 'Dashboard settings changed while copying. Nothing was copied; create a new preview.');
      }
      return { updated: preview.destinations.length, revision: doc.revision + 1, destinations: preview.destinations };
    }

    // -----------------------------------------------------------------------
    // Record field catalogue (authoring aid)
    // -----------------------------------------------------------------------

    /**
     * Record fields available to a target, from the record JSON schema of its
     * workflow stage (views: the source record type at the step's source stage,
     * or the starting stage). Unavailable schemas never block editing.
     */
    public async getFieldCatalogue(brand: BrandingModel, targetInput: unknown, options: DashboardCallerOptions = {}): Promise<DashboardFieldCatalogue> {
      const catalogue = await this.getTargetCatalogue(brand);
      const { info } = this.requireAvailableTarget(catalogue, targetInput);
      const result = await this.fieldCatalogueFor(brand, info, options);
      return result ?? this.unavailableCatalogue(info, 'no-caller');
    }

    private unavailableCatalogue(info: DashboardTargetInfo, reason: string, workflowStage?: string): DashboardFieldCatalogue {
      return { status: 'unavailable', reason, recordType: info.recordType, workflowStage, fields: DASHBOARD_SYSTEM_FIELDS.map((f) => ({ ...f })), openPrefixes: [] };
    }

    private async fieldCatalogueFor(brand: BrandingModel, info: DashboardTargetInfo, options: DashboardCallerOptions): Promise<DashboardFieldCatalogue | undefined> {
      if (!options.caller) {
        return undefined;
      }
      let workflowStage: string | undefined;
      if (info.target.kind === 'workflow') {
        workflowStage = info.target.stage;
      } else {
        const viewTarget = info.target;
        const step = ((sails.config.dashboardview ?? {}) as Record<string, DashboardViewDefinition>)[viewTarget.view]?.steps?.find((s) => s.name === viewTarget.step);
        workflowStage = step?.fetchMode === 'workflowStage' ? step.sourceWorkflowStage : undefined;
      }
      const roles = ((options.caller.user?.roles ?? []) as Array<{ name?: string }>).map((r) => r?.name ?? '').sort().join(',');
      const key = JSON.stringify([String(brand.id), info.recordType, workflowStage ?? '', roles]);
      const now = Date.now();
      const cached = this.fieldCatalogueCache.get(key);
      if (cached && cached.expires > now) {
        return cached.value;
      }
      const value = this.describeFields(brand, info, workflowStage, options).catch((error) => {
        this.fieldCatalogueCache.delete(key);
        sails.log.warn('DashboardConfigService: could not describe record fields', error);
        return this.unavailableCatalogue(info, 'unavailable', workflowStage);
      });
      this.fieldCatalogueCache.set(key, { expires: now + FIELD_CATALOGUE_TTL_MS, value });
      return value;
    }

    private async describeFields(brand: BrandingModel, info: DashboardTargetInfo, workflowStage: string | undefined, options: DashboardCallerOptions): Promise<DashboardFieldCatalogue> {
      const schemaService = (sails.services as Record<string, unknown> | undefined)?.recordschemaservice as
        | { describeStage?: (request: DescribeRecordStageSchemaRequest) => Promise<DescribeRecordStageSchemaResult> }
        | undefined;
      if (!schemaService?.describeStage || !options.caller) {
        return this.unavailableCatalogue(info, 'record-schema-unavailable', workflowStage);
      }
      const result = await schemaService.describeStage({
        brand: String(brand.id),
        branding: brand.name,
        portal: options.portal || sails.config.auth?.defaultPortal || 'rdmp',
        recordType: info.recordType,
        targetStep: workflowStage,
        caller: options.caller
      });
      if (result.kind === 'unavailable') {
        return this.unavailableCatalogue(info, result.code, workflowStage);
      }
      const flattened = flattenRecordJsonSchema(result.document);
      return {
        status: result.completeness === 'complete' ? 'complete' : 'partial',
        recordType: info.recordType,
        workflowStage,
        fields: [...flattened.fields.map((f) => ({ ...f, label: f.label || labelForFieldPath(f.path) })), ...DASHBOARD_SYSTEM_FIELDS.map((f) => ({ ...f }))],
        openPrefixes: flattened.openPrefixes
      };
    }

    // -----------------------------------------------------------------------
    // Runtime
    // -----------------------------------------------------------------------

    /**
     * Settings for every stage of a record type (or every step of a view) from
     * one document snapshot, with a per-target fingerprint used to request
     * matching compiled templates.
     */
    public async getRuntimeSettings(brand: BrandingModel, kind: 'workflow' | 'view', owner: string): Promise<DashboardRuntimeSettings> {
      const doc = await this.requireDocument(brand);
      const entries = (kind === 'workflow' ? doc.configData.workflows : doc.configData.views)[owner] ?? {};
      const targets: DashboardRuntimeSettings['targets'] = {};
      for (const [step, settings] of Object.entries(entries)) {
        const normalised = normaliseDashboardSettings(settings);
        targets[step] = { settings: normalised, fingerprint: fingerprint(normalised) };
      }
      return { revision: doc.revision, targets };
    }

    /**
     * Settings for one target for template compilation. When a fingerprint is
     * supplied it must match the saved settings; a newer save is reported
     * rather than silently compiling different settings.
     */
    public async getRuntimeTargetSettings(brand: BrandingModel, target: DashboardTarget, expectedFingerprint?: string): Promise<{ settings: DashboardSettings; fingerprint: string } | null> {
      const doc = await this.requireDocument(brand);
      const settings = getTargetSettings(doc.configData, target);
      if (!settings) {
        return null;
      }
      const normalised = normaliseDashboardSettings(settings);
      const current = fingerprint(normalised);
      if (expectedFingerprint && expectedFingerprint !== current) {
        throw new DashboardConfigError('settings-changed', `Dashboard settings for ${targetLabel(target)} changed; reload the dashboard.`);
      }
      return { settings: normalised, fingerprint: current };
    }

    public async getDashboardContext(brand: BrandingModel, mode: string): Promise<DashboardModeContext> {
      const doc = await this.requireDocument(brand);
      return _.cloneDeep(doc.configData.contexts?.[mode] ?? {});
    }

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    private async isLegacyMigrationLogged(): Promise<boolean> {
      const migrationModel = sails.models?.migration as { findOne?: (criteria: AnyRecord) => Promise<unknown> } | undefined;
      if (!migrationModel?.findOne) {
        return false;
      }
      return !!(await migrationModel.findOne({ name: DASHBOARD_CONFIGURATION_MIGRATION_NAME }));
    }

    /**
     * Narrow post-bootstrap step, run after core and hook bootstraps. Creates
     * missing brand documents only when the legacy migration has completed, then
     * inserts settings for targets that have none.
     */
    public async initialiseAfterBootstrap(): Promise<void> {
      await this.ensureStorage();
      const migrated = await this.isLegacyMigrationLogged();
      const problems: string[] = [];
      for (const brandName of BrandingService.getAvailable()) {
        const brand = BrandingService.getBrand(brandName);
        if (!brand) {
          continue;
        }
        const doc = await this.loadDocument(String(brand.id));
        if (!doc) {
          if (!migrated) {
            problems.push(brandName);
            continue;
          }
          await this.createDocument(String(brand.id), emptyDashboardConfigurationData(), { createdBy: 'initialisation', createdAt: new Date().toISOString() });
        }
        await this.initialiseMissingTargets(brand);
      }
      if (problems.length) {
        this.ready = false;
        this.notReadyReason = `Dashboard configuration migration "${DASHBOARD_CONFIGURATION_MIGRATION_NAME}" has not completed for brand(s) ${problems.join(', ')}. Dashboards are unavailable until it runs; start without REDBOX_SKIP_MIGRATIONS.`;
        sails.log.error(`DashboardConfigService: ${this.notReadyReason}`);
        return;
      }
      this.ready = true;
      sails.log.verbose('DashboardConfigService: dashboard configuration ready.');
    }

    /** Current hook/core declarations converted once into independent seed settings. */
    private async computeSeeds(brand: BrandingModel): Promise<LegacyConversionResult> {
      const capture = await this.captureLegacyInput(brand, { includeOverrides: false });
      return convertLegacyDashboardConfiguration(capture.input);
    }

    /**
     * Insert-if-missing by target identity. Existing settings (even empty ones)
     * are never replaced. Retries on a concurrent write.
     */
    public async initialiseMissingTargets(brand: BrandingModel): Promise<number> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const doc = await this.loadDocument(String(brand.id));
        if (!doc) {
          return 0;
        }
        const catalogue = await this.getTargetCatalogue(brand, doc.configData);
        const missing = catalogue.targets.filter((t) => !getTargetSettings(doc.configData, t.target));
        const seeds = missing.length || !doc.configData.contexts || Object.keys(doc.configData.contexts).length === 0 ? await this.computeSeeds(brand) : null;
        const next = _.cloneDeep(doc.configData) as DashboardConfigurationData;
        let added = 0;
        for (const info of missing) {
          setTargetSettings(next, info.target, getTargetSettings(seeds!.data, info.target) ?? builtInDashboardSettings());
          added++;
        }
        for (const [mode, context] of Object.entries(seeds?.data.contexts ?? {})) {
          if (!Object.prototype.hasOwnProperty.call(next.contexts, mode)) {
            next.contexts[mode] = context;
            added++;
          }
        }
        if (added === 0) {
          return 0;
        }
        if (await this.conditionalUpdate(doc, next)) {
          sails.log.verbose(`DashboardConfigService: initialised ${missing.length} dashboard target(s) for brand ${brand.name}.`);
          return missing.length;
        }
      }
      throw new Error(`DashboardConfigService: could not initialise dashboard settings for brand ${brand.name} after repeated concurrent updates`);
    }

    // -----------------------------------------------------------------------
    // Legacy migration (one-time)
    // -----------------------------------------------------------------------

    /**
     * Read only the dashboard-relevant legacy inputs directly from the database
     * and resolved configuration. Safe before bootstrap.
     */
    public async captureLegacyInput(brand: { id: string | number; name: string }, options: { includeOverrides?: boolean } = {}): Promise<{ input: LegacyCaptureInput; raw: AnyRecord }> {
      const brandId = String(brand.id);
      const recordTypeRows = (await RecordType.find({ branding: brandId })) as unknown as Array<{ id: string; name: string }>;
      const recordTypes: LegacyRecordTypeInput[] = [];
      const rawWorkflowSteps: AnyRecord[] = [];
      for (const recordType of recordTypeRows) {
        const steps = (await WorkflowStep.find({ recordType: recordType.id })) as unknown as Array<{ name: string; hidden?: boolean; config?: AnyRecord }>;
        rawWorkflowSteps.push(...steps.map((s) => ({ recordType: recordType.name, name: s.name, hidden: s.hidden === true, config: s.config })));
        recordTypes.push({
          name: recordType.name,
          steps: steps.map((s) => ({ name: s.name, hidden: s.hidden === true, displayIndex: _.get(s, 'config.displayIndex') as number | undefined, table: _.get(s, 'config.dashboard.table') }))
        });
      }
      const profileRows = (await DashboardType.find({ branding: brandId })) as unknown as LegacyDashboardTypeInput[];
      const configProfiles = Object.entries((sails.config.dashboardtype ?? {}) as unknown as Record<string, AnyRecord>).map(([name, def]) => ({ name, formatRules: def.formatRules, tableConfig: def.tableConfig, searchable: def.searchable as boolean | undefined }));
      const dashboardTypes = profileRows.length ? profileRows.map((p) => ({ name: p.name, formatRules: p.formatRules, tableConfig: p.tableConfig, searchable: p.searchable })) : configProfiles;

      let overrides: LegacyOverrideInput | null = null;
      let overrideRows: AnyRecord[] = [];
      let overrideSource = 'none';
      if (options.includeOverrides !== false) {
        overrideRows = (await AppConfig.find({ branding: brandId, configKey: DASHBOARD_LEGACY_OVERRIDE_KEY })) as unknown as AnyRecord[];
        // The old service selected the most recently updated row.
        const timestamp = (row: AnyRecord) => {
          const updatedAt = Date.parse(String(row.updatedAt ?? ''));
          if (!Number.isNaN(updatedAt)) {
            return updatedAt;
          }
          const createdAt = Date.parse(String(row.createdAt ?? ''));
          return Number.isNaN(createdAt) ? 0 : createdAt;
        };
        const selected = overrideRows.reduce<AnyRecord | undefined>(
          (latest, row) => !latest || timestamp(row) >= timestamp(latest) ? row : latest,
          undefined
        );
        if (selected) {
          overrides = selected.configData as LegacyOverrideInput;
          overrideSource = `appconfig:${String(selected.id)}`;
        } else {
          const defaults = _.get(sails.config, ['brandingConfigurationDefaults', DASHBOARD_LEGACY_OVERRIDE_KEY]);
          if (!_.isEmpty(defaults)) {
            overrides = _.cloneDeep(defaults) as LegacyOverrideInput;
            overrideSource = 'brandingConfigurationDefaults';
          }
        }
      }
      const views = _.cloneDeep(sails.config.dashboardview ?? {});
      return {
        input: { recordTypes, dashboardTypes, overrides, views },
        raw: {
          brand: { id: brandId, name: brand.name },
          capturedAt: new Date().toISOString(),
          overrideSource,
          appConfigDashboardTableConfigRows: overrideRows,
          dashboardTypeRows: profileRows,
          configuredDashboardTypes: configProfiles,
          workflowSteps: rawWorkflowSteps,
          dashboardViews: views
        }
      };
    }

    private async listPersistedBrands(): Promise<Array<{ id: string; name: string }>> {
      const rows = (await BrandingConfig.find({})) as unknown as Array<{ id: string; name: string }>;
      return rows.map((r) => ({ id: String(r.id), name: r.name }));
    }

    /** Read-only preflight report for operators; never writes. */
    public async preflightLegacyMigration(): Promise<LegacyPreflightReport[]> {
      const reports: LegacyPreflightReport[] = [];
      for (const brand of await this.listPersistedBrands()) {
        const doc = await this.loadDocument(brand.id);
        const { input } = await this.captureLegacyInput(brand);
        const conversion = convertLegacyDashboardConfiguration(input);
        reports.push({ brand, alreadyMigrated: !!doc?.provenance?.migration, conversion, summary: summariseLegacyConversion(conversion, brand.name) });
      }
      return reports;
    }

    private loadResolutions(): DashboardMigrationResolutions | null {
      const file = process.env.REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS;
      if (!file) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (!isPlainObject(parsed)) {
        throw new Error('Dashboard migration resolutions must be a JSON object.');
      }
      if (parsed.acceptedFindingIds !== undefined) {
        const legacyIds = parsed.acceptedFindingIds;
        if (!Array.isArray(legacyIds) || legacyIds.length > 0) {
          throw new Error(
            'Unscoped acceptedFindingIds are unsafe across brands. Use acceptedFindingIdsByBrand and bind each decision to captureFingerprints.<brand>.'
          );
        }
      }
      const captureFingerprints = parsed.captureFingerprints ?? {};
      const acceptedFindingIdsByBrand = parsed.acceptedFindingIdsByBrand ?? {};
      const replacements = parsed.replacements ?? [];
      if (
        !isPlainObject(captureFingerprints) ||
        Object.values(captureFingerprints).some(value => typeof value !== 'string' || value.trim() === '')
      ) {
        throw new Error(
          'Dashboard migration captureFingerprints must map brand names to non-empty preflight fingerprints.'
        );
      }
      if (
        !isPlainObject(acceptedFindingIdsByBrand) ||
        Object.values(acceptedFindingIdsByBrand).some(
          ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id.trim() === '')
        )
      ) {
        throw new Error('Dashboard migration acceptedFindingIdsByBrand must map brand names to arrays of finding IDs.');
      }
      if (
        !Array.isArray(replacements) ||
        replacements.some(
          replacement =>
            !isPlainObject(replacement) ||
            typeof replacement.brand !== 'string' ||
            replacement.brand.trim() === '' ||
            !parseDashboardTarget(replacement.target) ||
            !isPlainObject(replacement.settings)
        )
      ) {
        throw new Error('Dashboard migration replacements must include a brand, a valid target and complete settings.');
      }
      return {
        captureFingerprints: captureFingerprints as Record<string, string>,
        acceptedFindingIdsByBrand: acceptedFindingIdsByBrand as Record<string, string[]>,
        replacements: replacements as DashboardMigrationReplacement[],
      };
    }

    /**
     * Idempotent one-time conversion, run by the app-local migration wrapper
     * before bootstrap. Per brand: keep an immutable recovery snapshot, convert,
     * refuse unresolved material differences, then publish one complete
     * document. Already published documents are never recreated.
     */
    public async migrateLegacyConfiguration(): Promise<void> {
      await this.ensureStorage();
      const resolutions = this.loadResolutions();
      const brands = await this.listPersistedBrands();
      if (brands.length === 0) {
        sails.log.info('Dashboard configuration migration: no brands exist yet (fresh installation); targets are initialised after bootstrap.');
        return;
      }
      const blocked: string[] = [];
      for (const brand of brands) {
        const existing = await this.loadDocument(brand.id);
        if (existing) {
          sails.log.info(`Dashboard configuration migration: brand ${brand.name} already has independent settings (revision ${existing.revision}); leaving them unchanged.`);
          continue;
        }
        const { input, raw } = await this.captureLegacyInput(brand);
        await this.saveLegacySnapshot(brand, raw, input);
        const conversion = convertLegacyDashboardConfiguration(input);
        const summary = summariseLegacyConversion(conversion, brand.name);
        sails.log.info(summary);

        const acceptedIds = resolutions && Object.prototype.hasOwnProperty.call(resolutions.acceptedFindingIdsByBrand, brand.name)
          ? resolutions.acceptedFindingIdsByBrand[brand.name]
          : [];
        const accepted = new Set(acceptedIds);
        const replacements = (resolutions?.replacements ?? []).filter(replacement => replacement.brand === brand.name);
        const replacementTargets = new Map<string, DashboardTarget>();
        for (const replacement of replacements) {
          const target = parseDashboardTarget(replacement.target)!;
          const key = targetKey(target);
          if (replacementTargets.has(key)) {
            throw new Error(
              `Dashboard migration resolutions contain more than one replacement for ${brand.name} / ${targetLabel(target)}.`
            );
          }
          replacementTargets.set(key, target);
        }

        const resolutionFindings = conversion.findings.filter(
          (f: LegacyMigrationFinding) => f.severity === 'resolution'
        );
        const unmatchedReplacements = Array.from(replacementTargets.values()).filter(
          target =>
            !resolutionFindings.some(finding => finding.target && targetKey(finding.target) === targetKey(target))
        );
        if (unmatchedReplacements.length) {
          throw new Error(
            `Dashboard migration replacement for brand ${brand.name} does not match a finding that needs resolution (${unmatchedReplacements.map(targetLabel).join(', ')}). Re-run preflight and check the target.`
          );
        }

        const hasDecisions = accepted.size > 0 || replacements.length > 0;
        const expectedFingerprint = resolutions && Object.prototype.hasOwnProperty.call(resolutions.captureFingerprints, brand.name)
          ? resolutions.captureFingerprints[brand.name]
          : undefined;
        if (hasDecisions && !expectedFingerprint) {
          throw new Error(
            `Dashboard migration resolutions contain decisions for brand ${brand.name}, but captureFingerprints.${brand.name} is missing. Run the migration preflight and add that brand's inputFingerprint before upgrading.`
          );
        }
        if (hasDecisions && expectedFingerprint !== conversion.inputFingerprint) {
          throw new Error(
            `Dashboard migration resolutions for brand ${brand.name} were prepared for input ${expectedFingerprint}, but the deployed configuration is ${conversion.inputFingerprint}. Do not reuse those decisions; re-run preflight, review the new findings and update captureFingerprints.${brand.name}.`
          );
        }

        const unresolved = resolutionFindings.filter(
          (f: LegacyMigrationFinding) =>
            !accepted.has(f.id) && (!f.target || !replacementTargets.has(targetKey(f.target)))
        );
        if (unresolved.length) {
          blocked.push(`${brand.name}: ${unresolved.map((f) => `${f.id} (${f.message})`).join('; ')}`);
          continue;
        }
        const data = conversion.data;
        // Operator-reviewed replacement settings for unavoidable differences.
        for (const replacement of replacements) {
          const target = parseDashboardTarget(replacement.target)!;
          setTargetSettings(data, target, normaliseDashboardSettings(replacement.settings));
        }
        await this.createDocument(brand.id, data, {
          migration: {
            name: DASHBOARD_CONFIGURATION_MIGRATION_NAME,
            migratedAt: new Date().toISOString(),
            inputFingerprint: conversion.inputFingerprint,
            acceptedFindingIds: conversion.findings.filter(f => accepted.has(f.id)).map(f => f.id),
            replacementResolvedFindingIds: resolutionFindings
              .filter(f => f.target && replacementTargets.has(targetKey(f.target)))
              .map(f => f.id),
            findings: conversion.findings,
          },
        });
        sails.log.info(`Dashboard configuration migration: published independent settings for brand ${brand.name} (${conversion.targets.length} targets).`);
      }
      if (blocked.length) {
        throw new Error(`Dashboard configuration migration stopped: material differences need an explicit resolution before upgrading. Run the preflight, review the findings and supply REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS. ${blocked.join(' | ')}`);
      }
    }

    /** First snapshot wins: a rerun never replaces it with post-migration data. */
    private async saveLegacySnapshot(brand: { id: string; name: string }, raw: AnyRecord, input: LegacyCaptureInput): Promise<void> {
      const existing = await AppConfig.findOne({ branding: brand.id, configKey: DASHBOARD_LEGACY_SNAPSHOT_KEY });
      if (existing) {
        return;
      }
      await AppConfig.create({
        branding: brand.id,
        configKey: DASHBOARD_LEGACY_SNAPSHOT_KEY,
        configData: { snapshotVersion: 1, inputFingerprint: fingerprint(input), ...raw }
      });
    }
  }
}

declare global {
  let DashboardConfigService: Services.DashboardConfig;
}
