import * as _ from 'lodash';
import {
  BrandingModel,
} from '../model';
import { Services as services } from '../CoreService';
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentConfigOutline,
  FormConfigOutline,
  FormPrehydratePayload,
  FormPrehydrateRootKey,
  FormPrehydrateVocabTreePayload,
  TypeaheadInputComponentName,
  TypeaheadInputFieldComponentConfigOutline,
  TypeaheadOption,
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

type TypeaheadTarget = {
  sourceType: 'namedQuery' | 'vocabulary';
  sourceRef: string;
  storedValue: string;
  labelField: string;
  valueField: string;
};

type ExtractedTargets = {
  checkboxTrees: CheckboxTreeTarget[];
  typeaheads: TypeaheadTarget[];
};

type BuildInput = {
  branding: BrandingModel | string;
  formConfig: FormConfigOutline;
  user: AnyRecord;
};

type PrehydrateConfig = {
  enabled: boolean;
  maxTypeaheadValues: number;
  maxVocabSelections: number;
};

export namespace Services {
  export class FormPayloadPrehydrateService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'build',
      'extractTargets',
      'resolveVocabTrees',
      'resolveTypeaheadLabels'
    ];

    public async build({ branding, formConfig, user }: BuildInput): Promise<FormPrehydratePayload | undefined> {
      const config = this.getPrehydrateConfig();
      if (!config.enabled) {
        return undefined;
      }

      const extracted = this.extractTargets(formConfig, config);
      if (extracted.checkboxTrees.length === 0 && extracted.typeaheads.length === 0) {
        return undefined;
      }

      try {
        const [vocabTrees, typeaheadLabels] = await Promise.all([
          this.resolveVocabTrees(branding, extracted.checkboxTrees),
          this.resolveTypeaheadLabels(branding, extracted.typeaheads, user)
        ]);

        const payload: FormPrehydratePayload = {};
        if (!_.isEmpty(vocabTrees)) {
          payload.vocabTrees = vocabTrees;
        }
        if (!_.isEmpty(typeaheadLabels)) {
          payload.typeaheadLabels = typeaheadLabels;
        }

        return _.isEmpty(payload) ? undefined : payload;
      } catch (error) {
        this.logger.warn('Failed to build form prehydrate payload', error);
        return undefined;
      }
    }

    public extractTargets(formConfig: FormConfigOutline, config = this.getPrehydrateConfig()): ExtractedTargets {
      const checkboxTrees: CheckboxTreeTarget[] = [];
      const typeaheads: TypeaheadTarget[] = [];
      const componentDefinitions = Array.isArray(formConfig?.componentDefinitions) ? formConfig.componentDefinitions : [];
      let remainingVocabSelections = Math.max(0, config.maxVocabSelections);
      let remainingTypeaheadValues = Math.max(0, config.maxTypeaheadValues);

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

        if (componentClass === TypeaheadInputComponentName && remainingTypeaheadValues > 0) {
          const cfg = componentConfig as TypeaheadInputFieldComponentConfigOutline;
          const sourceType = cfg?.sourceType;
          const sourceRef = String((sourceType === 'namedQuery' ? cfg?.queryId : cfg?.vocabRef) ?? '').trim();
          const valueMode = cfg?.valueMode ?? 'value';
          const storedValue = typeof modelConfig?.value === 'string' ? String(modelConfig.value).trim() : '';

          if (
            (sourceType === 'namedQuery' || sourceType === 'vocabulary') &&
            valueMode !== 'optionObject' &&
            sourceRef &&
            storedValue
          ) {
            typeaheads.push({
              sourceType,
              sourceRef,
              storedValue,
              labelField: String(cfg?.labelField ?? 'label').trim() || 'label',
              valueField: String(cfg?.valueField ?? 'value').trim() || 'value'
            });
            remainingTypeaheadValues -= 1;
          }
        }

        const nestedDefinitions = Array.isArray(componentConfig?.componentDefinitions)
          ? componentConfig.componentDefinitions as AnyRecord[]
          : [];
        for (const nestedDefinition of nestedDefinitions) {
          visit(nestedDefinition);
        }
      };

      for (const definition of componentDefinitions) {
        visit(definition as unknown as AnyRecord);
      }

      return { checkboxTrees, typeaheads };
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

    public async resolveTypeaheadLabels(
      branding: BrandingModel | string,
      targets: TypeaheadTarget[],
      user: AnyRecord
    ): Promise<Record<string, TypeaheadOption>> {
      const payload: Record<string, TypeaheadOption> = {};

      for (const target of targets) {
        try {
          const option = target.sourceType === 'namedQuery'
            ? await this.resolveNamedQueryLabel(branding, target, user)
            : await this.resolveVocabularyLabel(branding, target);
          if (option) {
            payload[this.getTypeaheadCacheKey(target)] = option;
          }
        } catch (error) {
          this.logger.warn(`Failed to prehydrate typeahead '${target.sourceType}:${target.sourceRef}:${target.storedValue}'`, error);
        }
      }

      return payload;
    }

    private getPrehydrateConfig(): PrehydrateConfig {
      const configured = (sails.config.form?.prehydrate ?? {}) as {
        enabled?: boolean;
        maxTypeaheadValues?: number;
        maxVocabSelections?: number;
      };
      return {
        enabled: configured.enabled ?? true,
        maxTypeaheadValues: Number.isInteger(configured.maxTypeaheadValues)
          ? Math.max(0, Number(configured.maxTypeaheadValues))
          : 50,
        maxVocabSelections: Number.isInteger(configured.maxVocabSelections)
          ? Math.max(0, Number(configured.maxVocabSelections))
          : 50,
      };
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

    private async resolveNamedQueryLabel(
      branding: BrandingModel | string,
      target: TypeaheadTarget,
      user: AnyRecord
    ): Promise<TypeaheadOption | undefined> {
      const brand = typeof branding === 'string' ? BrandingService.getBrand(branding) ?? { name: branding } : branding;
      const response = await VocabService.findRecords(
        target.sourceRef,
        brand,
        target.storedValue,
        0,
        25,
        user as Parameters<typeof VocabService.findRecords>[5]
      ) as AnyRecord | AnyRecord[];
      const records = this.extractNamedQueryRecords(response);
      const options = records.map((record) => {
        const label = _.get(record, target.labelField);
        const value = _.get(record, target.valueField);
        return {
          label: String(label ?? ''),
          value: String(value ?? label ?? ''),
          sourceType: 'namedQuery' as const,
          raw: record
        };
      }).filter((option) => option.label || option.value);

      return options.find((option) => option.value === target.storedValue || option.label === target.storedValue);
    }

    private async resolveVocabularyLabel(
      branding: BrandingModel | string,
      target: TypeaheadTarget
    ): Promise<TypeaheadOption | undefined> {
      const vocabulary = await VocabularyService.getByIdOrSlug(this.getBrandingName(branding), target.sourceRef) as { id?: string | number } | null;
      if (!vocabulary?.id) {
        return undefined;
      }

      const entry = await VocabularyEntry.findOne({
        vocabulary: String(vocabulary.id),
        or: [
          { value: target.storedValue },
          { identifier: target.storedValue },
          { label: target.storedValue }
        ]
      }) as unknown as AnyRecord | null;
      if (!entry) {
        return undefined;
      }

      const entryRecord = entry as unknown as Record<string, unknown>;
      const label = _.get(entryRecord, target.labelField);
      const value = _.get(entryRecord, target.valueField);
      return {
        label: String(label ?? entryRecord['label'] ?? ''),
        value: String(value ?? entryRecord['value'] ?? target.storedValue),
        sourceType: 'vocabulary',
        historical: entryRecord['historical'] === true,
        raw: entryRecord
      };
    }

    private getTypeaheadCacheKey(target: TypeaheadTarget): string {
      return `${target.sourceType}:${target.sourceRef}:${target.labelField}:${target.valueField}:${target.storedValue}`;
    }

    private extractNamedQueryRecords(response: AnyRecord | AnyRecord[]): AnyRecord[] {
      if (Array.isArray(response)) {
        return response;
      }
      const root = (response?.data ?? response) as AnyRecord;
      if (Array.isArray(root)) {
        return root;
      }
      if (Array.isArray(root?.records)) {
        return root.records as AnyRecord[];
      }
      if (Array.isArray((root?.response as AnyRecord | undefined)?.docs)) {
        return ((root.response as AnyRecord).docs ?? []) as AnyRecord[];
      }
      return [];
    }
  }
}

declare global {
  let FormPayloadPrehydrateService: Services.FormPayloadPrehydrateService;
}
