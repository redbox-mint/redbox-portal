export const recordExportedMethods = [
  'create',
  'updateMeta',
  'getFigshareIntentStorage',
  'setRecordFields',
  'updateMetaInternal',
  'mutateMetaInternal',
  'getMeta',
  'getRecordFormFingerprint',
  'getRecordAudit',
  'getResolvedPermissionsSummary',
  'hasCreateAccess',
  'hasEditAccess',
  'hasTransitionRoleAuthorization',
  'hasViewAccess',
  'createBatch',
  'provideUserAccessAndRemovePendingAccess',
  'searchFuzzy',
  'getRelatedRecords',
  'getMetaWithRelationships',
  'getRecordTypeSummary',
  'delete',
  'restoreRecord',
  'destroyDeletedRecord',
  'getDeletedRecords',
  'getDeletedRecord',
  'getDeletedRecordMeta',
  'recoverLifecycleOperation',
  'recoverLifecycleOperations',
  'updateNotificationLog',
  'triggerPreSaveTriggers',
  'triggerPostSaveTriggers',
  'triggerPostSaveSyncTriggers',
  'checkRedboxRunning',
  'bootstrapData',
  'getAttachments',
  'cleanupAbandonedAttachmentStaging',
  'appendToRecord',
  'removeFromRecord',
  'getRecords',
  'exportAllPlans',
  'storeRecordAudit',
  'reconcilePostCommitSave',
  'exists',
  'transitionWorkflowStep',
  'setWorkflowStepRelatedMetadata',
  'transitionWorkflowStepMetadata',
  'triggerPreSaveTransitionWorkflowTriggers',
  'triggerPostSaveTransitionWorkflowTriggers',
  // 'updateDataStream',
  'handleUpdateDataStream',
  'init',
];
import _ from 'lodash';
import { prepareSourceIntent } from '../../services/figshare-v2/source-intent';
import { Services as Owned } from '../../records/Records';
import { getStorageRepositories } from '../../persistence/storage/runtime';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';
import { convertToType } from '../../utilities/convertToType';
import type { StorageService } from '../../StorageService';
import type { DatastreamService } from '../../DatastreamService';
import type { SearchService } from '../../SearchService';
import type { QueueService } from '../../QueueService';
import type { RecordPipelineInput } from '../../records/Records';
declare const RedboxJavaStorageService: unknown;

export namespace Services {
  export class Records extends Owned.Records {
    public constructor() {
      super({
        get config() {
          return sails.config;
        },
        get log() {
          return sails.log;
        },
        get repository() {
          return getStorageRepositories();
        },
        get storageService() {
          return sails.services[sails.config.storage.serviceName] as unknown as StorageService;
        },
        get datastreamService() {
          return sails.services[sails.config.record.datastreamService!] as unknown as DatastreamService;
        },
        get searchService() {
          return sails.services[sails.config.search.serviceName] as unknown as SearchService;
        },
        get queueService() {
          return sails.services[sails.config.queue.serviceName] as unknown as QueueService;
        },
        get branding() {
          return BrandingService;
        },
        get recordTypes() {
          return RecordTypesService;
        },
        get workflows() {
          return WorkflowStepsService;
        },
        get forms() {
          return FormsService;
        },
        get users() {
          return UsersService;
        },
        get roles() {
          return RolesService;
        },
        get schema() {
          return sails.services?.recordschemaservice as RecordPipelineInput['schema'];
        },
        get validation() {
          const registered = sails.services?.recordvalidationservice as RecordPipelineInput['validation'];
          return typeof registered?.resolve === 'function'
            ? registered
            : typeof RecordValidationService === 'undefined'
              ? undefined
              : RecordValidationService;
        },
        get attachments() {
          return sails.services?.attachmentmetadataservice as RecordPipelineInput['attachments'];
        },
        get translation() {
          return TranslationService;
        },
        stagingDisk: () => StorageManagerService.stagingDisk(),
        resolveHook: expression => eval(expression),
        prepareSourceIntent,
        wakeFigshareRecord: oid => FigshareService.wakeFigshareRecord(oid),
        emitSecurityEvent: record =>
          typeof SecurityEventService === 'undefined'
            ? Promise.resolve()
            : retainHttpRequestFollowup(
                sails,
                SecurityEventService.emitFromRecordAudit(record).catch(() => {
                  sails.log.error('Failed to emit record audit security event');
                })
              ),
      });
    }
    protected registerSailsHook(method: 'on' | 'after', events: string | string[], callback: () => unknown): void {
      if (typeof sails === 'undefined' || typeof sails[method] !== 'function') return;
      if (method === 'after') sails.after(events, callback);
      else for (const event of Array.isArray(events) ? events : [events]) sails.on(event, callback);
    }
    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods
          .map(name => {
            const method: unknown = Reflect.get(this, name);
            if (typeof method !== 'function') throw new Error('Missing comparison record operation: ' + name);
            return [name, method.bind(this)];
          })
          .concat([['convertToType', convertToType]])
      );
    }
    public override async bootstrapData(): Promise<void> {
      this.getServices();
      return super.bootstrapData();
    }
    public init() {
      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          that.getServices(that);
          void that.recoverLifecycleOperations().catch(() => {
            sails.log.warn('record_lifecycle_recovery_startup_failed', {
              event: 'record_lifecycle_recovery_startup_failed',
            });
          });
        }
      );
      this.registerSailsHook('on', 'lower', function () {
        that.close();
      });
    }

    private getServices(ref: Records = this) {
      ref.getDatastreamService(ref);
      ref.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      ref.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
      ref.getStorageService(ref);
    }

    getStorageService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.storage.serviceName)) {
        ref.storageService = RedboxJavaStorageService as StorageService;
      } else {
        ref.storageService = sails.services[sails.config.storage.serviceName] as unknown as StorageService;
      }
    }

    getDatastreamService(ref: Records = this) {
      if (_.isEmpty(sails.config.record) || _.isEmpty(sails.config.record.datastreamService)) {
        ref.datastreamService = RedboxJavaStorageService as DatastreamService;
      } else {
        const datastreamServiceName = sails.config.record.datastreamService as string;
        ref.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
      }
    }

    getSearchService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.search.serviceName)) {
        ref.searchService = SolrSearchService;
      } else {
        ref.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      }
    }

    protected _exportedMethods: string[] = recordExportedMethods;
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/records');
export function sailsRecordsExports(): Record<string, unknown> {
  const methods = recordExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.Records | undefined;
        if (!instance) {
          instance = new Services.Records();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison record operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
