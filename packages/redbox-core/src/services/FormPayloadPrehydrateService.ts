import * as _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import {
  BrandingModel,
} from '../model';
import { Services as services } from '../CoreService';
import './RecordsService';
import './FormsService';
import './FormRecordConsistencyService';
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentConfigOutline,
  FormConfigOutline,
  FormPrehydratePayload,
  FormPrehydrateRecordMetadataItem,
  FormPrehydrateRootKey,
  FormPrehydrateVocabTreePayload,
  RecordMetadataDisplayComponentName,
  VocabTreeChildrenResponse,
} from '@researchdatabox/sails-ng-common';

type AnyRecord = Record<string, unknown>;

type CheckboxTreeTarget = {
  vocabRef: string;
  selectedValues: Array<{
    notation: string;
    genealogy?: string[];
  }>;
};

type RecordMetadataTarget = {
  oid: string;
};

type BuildInput = {
  branding: BrandingModel | string;
  formConfig: FormConfigOutline;
  user?: AnyRecord;
};

type PrehydrateConfig = {
  enabled: boolean;
  maxVocabSelections: number;
  maxRecordMetadataOids: number;
};

export namespace Services {
  export class FormPayloadPrehydrateService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'build',
      'extractTargets',
      'resolveVocabTrees',
      'extractRecordMetadataTargets',
      'resolveRecordMetadata'
    ];

    public async build({ branding, formConfig, user }: BuildInput): Promise<FormPrehydratePayload | undefined> {
      const config = this.getPrehydrateConfig();
      if (!config.enabled) {
        return undefined;
      }

      const checkboxTrees = this.extractTargets(formConfig, config);
      const recordMetadataTargets = this.extractRecordMetadataTargets(formConfig, config);
      if (checkboxTrees.length === 0 && recordMetadataTargets.length === 0) {
        return undefined;
      }

      try {
        const [vocabTrees, recordMetadata] = await Promise.all([
          checkboxTrees.length > 0 ? this.resolveVocabTrees(branding, checkboxTrees) : Promise.resolve({}),
          recordMetadataTargets.length > 0
            ? this.resolveRecordMetadata(branding, formConfig, recordMetadataTargets, user)
            : Promise.resolve({})
        ]);

        const payload: FormPrehydratePayload = {};
        if (!_.isEmpty(vocabTrees)) {
          payload.vocabTrees = vocabTrees;
        }
        if (!_.isEmpty(recordMetadata)) {
          payload.recordMetadata = recordMetadata;
        }
        return _.isEmpty(payload) ? undefined : payload;
      } catch (error) {
        this.logger.warn('Failed to build form prehydrate payload', error);
        return undefined;
      }
    }

    public extractTargets(formConfig: FormConfigOutline, config = this.getPrehydrateConfig()): CheckboxTreeTarget[] {
      const checkboxTrees: CheckboxTreeTarget[] = [];
      const componentDefinitions = Array.isArray(formConfig?.componentDefinitions) ? formConfig.componentDefinitions : [];
      let remainingVocabSelections = Math.max(0, config.maxVocabSelections);

      const visit = (definition: AnyRecord) => {
        const component = (definition?.component ?? {}) as AnyRecord;
        const componentClass = String(component?.class ?? '').trim();
        const componentConfig = (component?.config ?? {}) as AnyRecord;
        const modelConfig = ((definition?.model ?? {}) as AnyRecord)?.config as AnyRecord | undefined;

        if (componentClass === CheckboxTreeComponentName && remainingVocabSelections > 0) {
          const cfg = componentConfig as CheckboxTreeFieldComponentConfigOutline;
          const vocabRef = String(cfg?.vocabRef ?? '').trim();
          const values = Array.isArray(modelConfig?.value) ? modelConfig.value : [];
          const selectedValues = values
            .map((value): { notation: string; genealogy?: string[] } | null => {
              const notation = String((value as AnyRecord)?.notation ?? '').trim();
              if (!notation) {
                return null;
              }
              const genealogy = Array.isArray((value as AnyRecord)?.genealogy)
                ? ((value as AnyRecord).genealogy as unknown[]).map((item) => String(item ?? '').trim()).filter(Boolean)
                : undefined;
              return { notation, genealogy };
            })
            .filter((value): value is { notation: string; genealogy?: string[] } => value !== null)
            .slice(0, remainingVocabSelections);

          remainingVocabSelections -= selectedValues.length;
          if (vocabRef && selectedValues.length > 0) {
            checkboxTrees.push({ vocabRef, selectedValues });
          }
        }

        for (const nestedDefinition of this.getNestedComponentDefinitions(componentConfig)) {
          visit(nestedDefinition);
        }
      };

      for (const definition of componentDefinitions) {
        visit(definition as unknown as AnyRecord);
      }

      return checkboxTrees;
    }

    public extractRecordMetadataTargets(
      formConfig: FormConfigOutline,
      config = this.getPrehydrateConfig()
    ): RecordMetadataTarget[] {
      const targets: RecordMetadataTarget[] = [];
      const componentDefinitions = Array.isArray(formConfig?.componentDefinitions) ? formConfig.componentDefinitions : [];
      const seen = new Set<string>();
      let remainingRecordMetadataOids = Math.max(0, config.maxRecordMetadataOids);

      const visit = (definition: AnyRecord) => {
        const component = (definition?.component ?? {}) as AnyRecord;
        const componentClass = String(component?.class ?? '').trim();
        const componentConfig = (component?.config ?? {}) as AnyRecord;
        const modelConfig = ((definition?.model ?? {}) as AnyRecord)?.config as AnyRecord | undefined;

        if (componentClass === RecordMetadataDisplayComponentName && remainingRecordMetadataOids > 0) {
          const normalizedOids = this.normalizeRecordMetadataOids(modelConfig?.value).slice(0, remainingRecordMetadataOids);
          for (const oid of normalizedOids) {
            if (seen.has(oid)) {
              continue;
            }
            seen.add(oid);
            targets.push({ oid });
            remainingRecordMetadataOids -= 1;
            if (remainingRecordMetadataOids <= 0) {
              break;
            }
          }
        }

        if (remainingRecordMetadataOids <= 0) {
          return;
        }

        for (const nestedDefinition of this.getNestedComponentDefinitions(componentConfig)) {
          visit(nestedDefinition);
          if (remainingRecordMetadataOids <= 0) {
            break;
          }
        }
      };

      for (const definition of componentDefinitions) {
        visit(definition as unknown as AnyRecord);
        if (remainingRecordMetadataOids <= 0) {
          break;
        }
      }

      return targets;
    }

    private getNestedComponentDefinitions(componentConfig: AnyRecord): AnyRecord[] {
      const nestedDefinitions: AnyRecord[] = [];
      if (Array.isArray(componentConfig?.componentDefinitions)) {
        nestedDefinitions.push(...componentConfig.componentDefinitions as AnyRecord[]);
      }

      const tabs = Array.isArray(componentConfig?.tabs) ? componentConfig.tabs as AnyRecord[] : [];
      for (const tab of tabs) {
        const tabDefinitions = ((tab?.component as AnyRecord | undefined)?.config as AnyRecord | undefined)?.componentDefinitions;
        if (Array.isArray(tabDefinitions)) {
          nestedDefinitions.push(...tabDefinitions as AnyRecord[]);
        }
      }

      const panels = Array.isArray(componentConfig?.panels) ? componentConfig.panels as AnyRecord[] : [];
      for (const panel of panels) {
        const panelDefinitions = ((panel?.component as AnyRecord | undefined)?.config as AnyRecord | undefined)?.componentDefinitions;
        if (Array.isArray(panelDefinitions)) {
          nestedDefinitions.push(...panelDefinitions as AnyRecord[]);
        }
      }

      return nestedDefinitions;
    }

    public async resolveVocabTrees(
      branding: BrandingModel | string,
      targets: CheckboxTreeTarget[]
    ): Promise<Record<string, FormPrehydrateVocabTreePayload>> {
      const payloadByVocabRef: Record<string, FormPrehydrateVocabTreePayload> = {};

      for (const target of targets) {
        const targetPayload = payloadByVocabRef[target.vocabRef] ?? {
          childrenByParentId: {},
          selectedNotations: []
        };

        for (const selected of target.selectedValues) {
          try {
            const chain = await this.resolveSelectionChain(branding, target.vocabRef, selected);
            if (chain.length === 0) {
              continue;
            }

            if (!targetPayload.selectedNotations.includes(selected.notation)) {
              targetPayload.selectedNotations.push(selected.notation);
            }

            const parentIdsToFetch: Array<string | null> = [null];
            for (const entry of chain.slice(0, -1)) {
              const entryId = String(entry.id ?? '').trim();
              if (entryId) {
                parentIdsToFetch.push(entryId);
              }
            }

            for (const parentId of parentIdsToFetch) {
              const parentKey = parentId || FormPrehydrateRootKey;
              if (targetPayload.childrenByParentId[parentKey]) {
                continue;
              }
              const response = await VocabularyService.getChildren(
                this.getBrandingName(branding),
                target.vocabRef,
                parentId ?? undefined
              ) as { entries: VocabTreeChildrenResponse['data']; meta: VocabTreeChildrenResponse['meta'] } | null;
              if (response) {
                targetPayload.childrenByParentId[parentKey] = {
                  data: response.entries,
                  meta: response.meta
                };
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to prehydrate vocab tree selection '${selected.notation}' for '${target.vocabRef}'`, error);
          }
        }

        if (!_.isEmpty(targetPayload.childrenByParentId) || targetPayload.selectedNotations.length > 0) {
          payloadByVocabRef[target.vocabRef] = targetPayload;
        }
      }

      return payloadByVocabRef;
    }

    public async resolveRecordMetadata(
      branding: BrandingModel | string,
      formConfig: FormConfigOutline,
      targets: RecordMetadataTarget[],
      user?: AnyRecord
    ): Promise<Record<string, FormPrehydrateRecordMetadataItem>> {
      const payloadByOid: Record<string, FormPrehydrateRecordMetadataItem> = {};
      const brandingName = this.getBrandingName(branding);
      const currentUser = (user ?? {}) as AnyRecord;
      const currentRoles = (currentUser['roles'] ?? []) as AnyRecord[];

      for (const target of targets) {
        const oid = String(target.oid ?? '').trim();
        if (!oid || payloadByOid[oid]) {
          continue;
        }

        try {
          const record = await RecordsService.getMeta(oid) as AnyRecord;
          if (!record || _.isEmpty(record)) {
            continue;
          }

          const hasViewAccess = RecordsService.hasViewAccess(branding as unknown, currentUser, currentRoles, record);
          if (!hasViewAccess) {
            continue;
          }

          const filteredMetadata = await this.filterMetadataForDisplay({
            branding,
            formConfig,
            record,
            user: currentUser,
            brandingName,
          });
          payloadByOid[oid] = {
            oid,
            data: filteredMetadata,
          };
        } catch (error) {
          this.logger.warn(`Failed to prehydrate record metadata for '${oid}'`, error);
          payloadByOid[oid] = {
            oid,
            error: true,
          };
        }
      }

      return payloadByOid;
    }

    private getPrehydrateConfig(): PrehydrateConfig {
      const configured = (sails.config.form?.prehydrate ?? {}) as {
        enabled?: boolean;
        maxVocabSelections?: number;
        maxRecordMetadataOids?: number;
      };
      return {
        enabled: configured.enabled ?? true,
        maxVocabSelections: Number.isInteger(configured.maxVocabSelections)
          ? Math.max(0, Number(configured.maxVocabSelections))
          : 50,
        maxRecordMetadataOids: Number.isInteger(configured.maxRecordMetadataOids)
          ? Math.max(0, Number(configured.maxRecordMetadataOids))
          : 50,
      };
    }

    private normalizeRecordMetadataOids(value: unknown): string[] {
      if (typeof value === 'string') {
        const oid = value.trim();
        return oid ? [oid] : [];
      }
      if (Array.isArray(value)) {
        return value
          .map((item) => typeof item === 'string' ? item.trim() : '')
          .filter(Boolean);
      }
      return [];
    }

    private async filterMetadataForDisplay(options: {
      branding: BrandingModel | string;
      brandingName: string;
      formConfig: FormConfigOutline;
      record: AnyRecord;
      user: AnyRecord;
    }): Promise<Record<string, unknown>> {
      const { branding, brandingName, formConfig: _formConfig, record, user } = options;
      const formName = String((record?.metaMetadata as AnyRecord | undefined)?.['form'] ?? '').trim();
      if (!formName) {
        return _.cloneDeep((record?.metadata ?? {}) as Record<string, unknown>);
      }

      try {
        const formRecord = await firstValueFrom(FormsService.getFormByName(formName, false, brandingName));
        const formConfiguration = formRecord?.configuration;
        if (!formConfiguration) {
          return _.cloneDeep((record?.metadata ?? {}) as Record<string, unknown>);
        }

        const userRoles = ((user?.['roles'] ?? []) as AnyRecord[])
          .map((role: AnyRecord) => String(role['name'] ?? ''))
          .filter((name: string) => !!name);
        const reusableFormDefs = sails.config.reusableFormDefinitions;
        const clientFormConfig = await FormsService.buildClientFormConfig(
          formConfiguration,
          'edit',
          userRoles,
          (record?.metadata ?? {}) as Record<string, unknown>,
          reusableFormDefs,
          this.getBrandingName(branding)
        );

        const emptyOriginal = {
          redboxOid: record.redboxOid,
          metaMetadata: record.metaMetadata,
          metadata: {}
        } as Parameters<typeof FormRecordConsistencyService.mergeRecordClientFormConfig>[0];

        const filteredRecord = await FormRecordConsistencyService.mergeRecordClientFormConfig(
          emptyOriginal,
          record as Parameters<typeof FormRecordConsistencyService.mergeRecordClientFormConfig>[1],
          clientFormConfig,
          'edit',
          reusableFormDefs,
        );
        return _.cloneDeep((filteredRecord?.metadata ?? {}) as Record<string, unknown>);
      } catch (error) {
        this.logger.warn(`Failed to filter prehydrated metadata for record '${String(record?.redboxOid ?? '')}'`, error);
        return _.cloneDeep((record?.metadata ?? {}) as Record<string, unknown>);
      }
    }

    private getBrandingName(branding: BrandingModel | string): string {
      if (typeof branding === 'string') {
        return branding;
      }
      return String(branding?.name ?? branding?.id ?? '');
    }

    private async resolveSelectionChain(
      branding: BrandingModel | string,
      vocabRef: string,
      selected: CheckboxTreeTarget['selectedValues'][number]
    ): Promise<Array<{ id?: string | number; parent?: string | null; vocabulary?: string | number }>> {
      const genealogy = Array.isArray(selected.genealogy) ? selected.genealogy.filter(Boolean) : [];
      if (genealogy.length > 0) {
        const notationChain = [...genealogy, selected.notation];
        const resolvedChain = await Promise.all(notationChain.map((notation) =>
          VocabularyService.getEntryByNotation(this.getBrandingName(branding), vocabRef, notation)
        ));
        return resolvedChain
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .map((entry) => ({
            id: entry.id,
            parent: entry.parent ? String(entry.parent) : null,
            vocabulary: entry.vocabulary ? String(entry.vocabulary) : undefined
          }));
      }

      return await VocabularyService.getAncestorChain(this.getBrandingName(branding), vocabRef, selected.notation) as Array<{
        id?: string | number;
        parent?: string | null;
        vocabulary?: string | number;
      }>;
    }
  }
}

declare global {
  let FormPayloadPrehydrateService: Services.FormPayloadPrehydrateService;
}
